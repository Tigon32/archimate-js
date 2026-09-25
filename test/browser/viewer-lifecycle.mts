// SYNTHETIC: Checks public read-only viewer DOM and event-listener teardown/remount.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

interface ViewerEventBus {
  on(event: string, listener: () => void): void;
  fire(event: string): unknown;
}

interface ViewerInstance {
  destroy(): void;
  get(name: string): ViewerEventBus;
}

interface ViewerApi {
  mountViewer(options: { xml: string; viewId: string; container: HTMLElement;
    width: string; height: string }): Promise<ViewerInstance>;
}

interface MountedCycle {
  mountedSvgCount: number;
  mountedNodeIds: string[];
  mountedConnectionIds: string[];
}

interface CleanupCycle {
  remainingObservableListeners: number;
  eventBusListenerRemoved: boolean;
  destroyedViewerNodes: number;
}

interface LifecycleResult {
  cycles: Array<{ mountedSvgCount: number; mountedNodeIds: string[]; mountedConnectionIds: string[];
    remainingObservableListeners: number; eventBusListenerRemoved: boolean;
    destroyedViewerNodes: number }>;
}

declare global {
  interface Window {
    __viewerLifecycleTracker?: {
      enabled: boolean;
      listeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject;
        capture: boolean }>;
    };
    __viewerLifecycleHost?: HTMLDivElement;
    __viewerLifecycleState?: {
      host: HTMLDivElement;
      viewer: ViewerInstance;
      eventBus: ViewerEventBus;
      eventCount: { value: number };
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
  const expectedNodeIds = ['node-component', 'node-service', 'node-service-nested'];
  const expectedConnectionIds = ['serving-connection'];
  const nodeShapeSelector = '.djs-element.djs-shape[data-element-id]';
  const cycles: LifecycleResult['cycles'] = [];
  let unexpectedNodeIdRejected = false;
  for (let cycle = 0; cycle < 8; cycle++) {
    const mounted = await page.evaluate(async (shapeSelector): Promise<MountedCycle> => {
    const api = (window as unknown as { ArchimateJS?: ViewerApi }).ArchimateJS;
    const tracker = window.__viewerLifecycleTracker;
    if (!api || !tracker) throw new Error('The public viewer API and lifecycle tracker must load.');
    const xml = await (await fetch('/synthetic.xml')).text();
    let host = window.__viewerLifecycleHost;
    if (!host) {
      host = document.createElement('div');
      host.style.width = '800px';
      host.style.height = '500px';
      document.body.append(host);
      window.__viewerLifecycleHost = host;
    }
    tracker.enabled = true;
    const viewer = await api.mountViewer({ xml, viewId: 'view-dto-export', container: host,
      width: '800px', height: '500px' });
    const mountedSvgCount = host.querySelectorAll('.djs-container > svg').length;
    // diagram-js also uses djs-shape for label objects; the renderer's visual kind identifies node shapes.
    const mountedNodeIds = Array.from(host.querySelectorAll<SVGElement>(shapeSelector))
      .filter((element) => element.querySelector(':scope > .djs-visual[data-export-kind="node"]'))
      .map((element) => element.getAttribute('data-element-id') ?? '').sort();
    const mountedConnectionIds = Array.from(host.querySelectorAll<SVGElement>(
      '.djs-connection[data-element-id]'), (element) => element.getAttribute('data-element-id') ?? '').sort();
    const eventBus = viewer.get('eventBus');
    const eventCount = { value: 0 };
    eventBus.on('viewer.lifecycle.probe', () => { eventCount.value++; });
    eventBus.fire('viewer.lifecycle.probe');
    if (eventCount.value !== 1) throw new Error('The mounted viewer event bus should deliver its probe event.');
    window.__viewerLifecycleState = { host, viewer, eventBus, eventCount };
    return { mountedSvgCount, mountedNodeIds, mountedConnectionIds };
    }, nodeShapeSelector);
    if (cycle === 0) {
      unexpectedNodeIdRejected = await page.evaluate(({ expectedIds, shapeSelector }) => {
        const host = window.__viewerLifecycleState?.host;
        const svg = host?.querySelector('.djs-container > svg');
        if (!host || !svg) throw new Error('The mounted viewer must expose its diagram SVG.');
        const shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        shape.classList.add('djs-element', 'djs-shape');
        shape.setAttribute('data-element-id', 'unexpected-shape');
        const visual = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        visual.classList.add('djs-visual');
        visual.setAttribute('data-export-kind', 'node');
        shape.append(visual);
        svg.append(shape);
        const ids = Array.from(host.querySelectorAll<SVGElement>(shapeSelector))
          .filter((element) => element.querySelector(':scope > .djs-visual[data-export-kind="node"]'))
          .map((element) => element.getAttribute('data-element-id') ?? '').sort();
        const rejectsUnexpectedId = ids.includes('unexpected-shape') &&
          JSON.stringify(ids) !== JSON.stringify(expectedIds);
        shape.remove();
        return rejectsUnexpectedId;
      }, { expectedIds: expectedNodeIds, shapeSelector: nodeShapeSelector });
    }
    const cleanup = await page.evaluate((): CleanupCycle => {
      const state = window.__viewerLifecycleState;
      const tracker = window.__viewerLifecycleTracker;
      if (!state || !tracker) throw new Error('The viewer lifecycle state must be available for teardown.');
      state.viewer.destroy();
      const destroyedViewerNodes = state.host.querySelectorAll('.djs-container, svg, .djs-element').length;
      state.eventBus.fire('viewer.lifecycle.probe');
      const eventBusListenerRemoved = state.eventCount.value === 1;
      const remainingObservableListeners = tracker.listeners.filter(({ target }) =>
        target === window || target === document || (target instanceof Node && document.body.contains(target))).length;
      tracker.enabled = false;
      tracker.listeners.length = 0;
      window.__viewerLifecycleState = undefined;
      return { destroyedViewerNodes, eventBusListenerRemoved, remainingObservableListeners };
    });
    cycles.push({ ...mounted, ...cleanup });
  }
  await page.evaluate(() => {
    window.__viewerLifecycleHost?.remove();
    window.__viewerLifecycleHost = undefined;
  });
  assert.equal(cycles.length, 8, 'the same connected container should complete eight mount/destroy cycles');
  assert.equal(unexpectedNodeIdRejected, true,
    'the diagram-js shape selector should include and reject an unexpected non-node-prefixed ID');
  for (const [index, cycle] of cycles.entries()) {
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
