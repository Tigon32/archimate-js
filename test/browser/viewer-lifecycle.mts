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
  cycles: Array<{ mountedSvgCount: number; mountedElements: number;
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
    for (let cycle = 0; cycle < 8; cycle++) {
      tracker.enabled = true;
      const viewer = await api.mountViewer({ xml, viewId: 'view-dto-export', container: host,
        width: '800px', height: '500px' });
      const mountedSvgCount = host.querySelectorAll('.djs-container > svg').length;
      const mountedElements = host.querySelectorAll('.djs-element').length;
      if (mountedSvgCount !== 1 || mountedElements < 3) {
        throw new Error('The synthetic view must render one SVG with its expected diagram elements.');
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
      cycles.push({ mountedSvgCount, mountedElements, remainingObservableListeners,
        eventBusListenerRemoved, destroyedViewerNodes });
    }
    host.remove();
    return { cycles };
  });
  assert.equal(result.cycles.length, 8, 'the same connected container should complete eight mount/destroy cycles');
  for (const [index, cycle] of result.cycles.entries()) {
    assert.equal(cycle.mountedSvgCount, 1, `cycle ${index + 1} should mount exactly one viewer SVG`);
    assert.ok(cycle.mountedElements >= 3, `cycle ${index + 1} should render the synthetic diagram nodes`);
    assert.equal(cycle.destroyedViewerNodes, 0, `cycle ${index + 1} should remove viewer-owned DOM`);
    assert.equal(cycle.remainingObservableListeners, 0,
      `cycle ${index + 1} should remove tracked listeners from connected page targets`);
    assert.equal(cycle.eventBusListenerRemoved, true,
      `cycle ${index + 1} should stop delivering viewer event-bus callbacks after destroy`);
  }
  console.log('viewer lifecycle browser check passed: 8 same-container mount/destroy cycles; measured viewer DOM removal, connected-target listeners, and event-bus callbacks, not heap size');
} finally {
  if (browser) await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
