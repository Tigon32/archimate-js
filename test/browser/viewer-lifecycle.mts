// SYNTHETIC: Checks public read-only viewer DOM and event-listener teardown/remount.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

interface ViewerApi {
  mountViewer(options: { xml: string; viewId: string; container: HTMLElement;
    width: string; height: string }): Promise<{ destroy(): void;
      get(name: string): { on(event: string, listener: () => void): void; fire(event: string): unknown } }>;
}

interface LifecycleResult {
  cycles: Array<{ mountedSvgCount: number; mountedNodeIds: string[]; mountedConnectionIds: string[];
    remainingObservableListeners: number; eventBusListenerRemoved: boolean;
    destroyedViewerNodes: number }>;
  unexpectedNodeIdRejected: boolean;
}

declare global {
  interface Window {
    __viewerLifecycleTracker?: {
      enabled: boolean;
      listeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject;
        capture: boolean }>;
    };
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = new Map<string, string>([
  ['/viewer.js', '.ci-build/archimate-js.js'],
  ['/diagram.css', 'node_modules/diagram-js/assets/diagram-js.css'],
  ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml']
]);
const server = createServer((request: { url?: string }, response: {
  setHeader(name: string, value: string): void;
  end(body?: string | Uint8Array): void;
  writeHead(status: number): { end(body?: string | Uint8Array): void };
}) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><link rel="stylesheet" href="/diagram.css"><script src="/viewer.js"></script>');
    return;
  }
  const file = routes.get(pathname);
  if (!file) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', pathname.endsWith('.css') ? 'text/css; charset=utf-8' :
    pathname.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/javascript; charset=utf-8');
  response.end(readFileSync(path.join(root, file)));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  await page.addInitScript(() => {
    const active: NonNullable<Window['__viewerLifecycleTracker']>['listeners'] = [];
    const tracker = { enabled: false, listeners: active };
    const captureOf = (options?: boolean | AddEventListenerOptions) =>
      typeof options === 'boolean' ? options : Boolean(options?.capture);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (tracker.enabled && listener && !active.some((entry) => entry.target === this &&
          entry.type === type && entry.listener === listener && entry.capture === captureOf(options))) {
        active.push({ target: this, type, listener, capture: captureOf(options) });
      }
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (tracker.enabled && listener) {
        const index = active.findIndex((entry) => entry.target === this && entry.type === type &&
          entry.listener === listener && entry.capture === captureOf(options));
        if (index >= 0) active.splice(index, 1);
      }
      return remove.call(this, type, listener, options);
    };
    window.__viewerLifecycleTracker = tracker;
  });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await page.goto(origin, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async (): Promise<LifecycleResult> => {
    const api = (window as unknown as { ArchimateJS?: ViewerApi }).ArchimateJS;
    const tracker = window.__viewerLifecycleTracker;
    if (!api || !tracker) throw new Error('The public viewer API and lifecycle tracker must load.');
    const xml = await (await fetch('/synthetic.xml')).text();
    const host = document.createElement('div');
    host.style.width = '800px';
    host.style.height = '500px';
    document.body.append(host);
    const cycles: LifecycleResult['cycles'] = [];
    const expectedNodeIds = ['node-component', 'node-service', 'node-service-nested'];
    const expectedConnectionIds = ['serving-connection'];
    // diagram-js also uses djs-shape for label objects; the renderer's visual kind identifies node shapes.
    const mountedNodeIdsFor = (container: ParentNode) => Array.from(
      container.querySelectorAll<SVGElement>('.djs-element.djs-shape[data-element-id]'))
      .filter((element) => element.querySelector(':scope > .djs-visual[data-export-kind="node"]'))
      .map((element) => element.getAttribute('data-element-id') ?? '').sort();
    const hasExpectedNodeIds = (ids: string[]) => JSON.stringify(ids) === JSON.stringify(expectedNodeIds);
    let unexpectedNodeIdRejected = false;
    for (let cycle = 0; cycle < 8; cycle++) {
      tracker.enabled = true;
      const viewer = await api.mountViewer({ xml, viewId: 'view-dto-export', container: host,
        width: '800px', height: '500px' });
      const mountedSvgCount = host.querySelectorAll('.djs-container > svg').length;
      if (cycle === 0) {
        const svg = host.querySelector('.djs-container > svg');
        if (!svg) throw new Error('The mounted viewer must expose its diagram SVG.');
        const unexpectedShape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        unexpectedShape.classList.add('djs-element', 'djs-shape');
        unexpectedShape.setAttribute('data-element-id', 'unexpected-shape');
        const visual = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        visual.classList.add('djs-visual');
        visual.setAttribute('data-export-kind', 'node');
        unexpectedShape.append(visual);
        svg.append(unexpectedShape);
        const idsWithUnexpectedShape = mountedNodeIdsFor(host);
        unexpectedNodeIdRejected = idsWithUnexpectedShape.includes('unexpected-shape') &&
          !hasExpectedNodeIds(idsWithUnexpectedShape);
        unexpectedShape.remove();
        if (!unexpectedNodeIdRejected) {
          throw new Error('The exact node-shape check must reject a synthetic unexpected non-node-prefixed ID.');
        }
      }
      const mountedNodeIds = mountedNodeIdsFor(host);
      const mountedConnectionIds = Array.from(host.querySelectorAll<SVGElement>('.djs-connection[data-element-id]'),
        (element) => element.getAttribute('data-element-id') ?? '').sort();
      if (mountedSvgCount !== 1 || !hasExpectedNodeIds(mountedNodeIds) ||
          JSON.stringify(mountedConnectionIds) !== JSON.stringify(expectedConnectionIds)) {
        throw new Error(`Unexpected synthetic diagram structure: node IDs ${mountedNodeIds.join(',')}; ` +
          `connections ${mountedConnectionIds.join(',')}.`);
      }
      const eventBus = viewer.get('eventBus');
      let eventCount = 0;
      eventBus.on('viewer.lifecycle.probe', () => { eventCount++; });
      eventBus.fire('viewer.lifecycle.probe');
      if (eventCount !== 1) throw new Error('The mounted viewer event bus should deliver its probe event.');
      viewer.destroy();
      const destroyedViewerNodes = host.querySelectorAll('.djs-container, svg, .djs-element').length;
      eventBus.fire('viewer.lifecycle.probe');
      const eventBusListenerRemoved = eventCount === 1;
      const remainingObservableListeners = tracker.listeners.filter(({ target }) =>
        target === window || target === document || (target instanceof Node && document.body.contains(target))).length;
      tracker.enabled = false;
      if (destroyedViewerNodes !== 0) throw new Error('Viewer-owned diagram DOM remained after destroy.');
      if (!eventBusListenerRemoved) throw new Error('Viewer event listeners remained active after destroy.');
      if (remainingObservableListeners !== 0) {
        throw new Error('Viewer event listeners remained on connected page targets after destroy.');
      }
      // Drop instrumentation references to detached diagram nodes between cycles.
      tracker.listeners.length = 0;
      cycles.push({ mountedSvgCount, mountedNodeIds, mountedConnectionIds, remainingObservableListeners,
        eventBusListenerRemoved, destroyedViewerNodes });
    }
    host.remove();
    return { cycles, unexpectedNodeIdRejected };
  });
  assert.equal(result.cycles.length, 8, 'the same connected container should complete eight mount/destroy cycles');
  assert.equal(result.unexpectedNodeIdRejected, true,
    'the diagram-js shape selector should include and reject an unexpected non-node-prefixed ID');
  const expectedNodeIds = ['node-component', 'node-service', 'node-service-nested'];
  const expectedConnectionIds = ['serving-connection'];
  for (const [index, cycle] of result.cycles.entries()) {
    assert.equal(cycle.mountedSvgCount, 1, `cycle ${index + 1} should mount exactly one viewer SVG`);
    assert.deepEqual(cycle.mountedNodeIds, expectedNodeIds,
      `cycle ${index + 1} should render exactly the three synthetic node IDs`);
    assert.deepEqual(cycle.mountedConnectionIds, expectedConnectionIds,
      `cycle ${index + 1} should render exactly the synthetic connection ID`);
    assert.equal(cycle.destroyedViewerNodes, 0, `cycle ${index + 1} should remove viewer-owned DOM`);
    assert.equal(cycle.remainingObservableListeners, 0,
      `cycle ${index + 1} should remove tracked listeners from connected page targets`);
    assert.equal(cycle.eventBusListenerRemoved, true,
      `cycle ${index + 1} should stop delivering viewer event-bus callbacks after destroy`);
  }
  console.log('viewer lifecycle browser check passed: 8 same-container cycles; verified all rendered node-shape IDs, rejected an unexpected shape ID, checked connection ID serving-connection, DOM removal, connected-target listeners, and event-bus callbacks; no heap-size claim');
} finally {
  if (browser) await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
