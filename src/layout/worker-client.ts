import { validateModelDto, type ModelDto, type ViewNodeDto } from '../model-dto/index.js';
import { layoutView } from './core.js';
import type { LayoutDiagnostic, LayoutExecutionOptions, LayoutOptions,
  LayoutResult, LayoutWorkerThresholds } from './types.js';
import { layoutWorkerRequest, parseLayoutWorkerResponse } from './worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_THRESHOLDS: Required<LayoutWorkerThresholds> = {
  minNodes: 25,
  minConnections: 25,
  minComplexity: 60
};
let nextRequestId = 1;

function diagnostic(code: LayoutDiagnostic['code'], message: string): LayoutResult {
  return { status: 'failed', diagnostics: [{ code, severity: 'error', message }] };
}

function layoutOptions(options: LayoutExecutionOptions): LayoutOptions {
  const { execution: _execution, workerThresholds: _thresholds,
    timeoutMs: _timeoutMs, signal: _signal, ...rest } = options;
  return rest;
}

function threshold(options?: LayoutWorkerThresholds): Required<LayoutWorkerThresholds> {
  return { ...DEFAULT_THRESHOLDS, ...options };
}

function nodeCount(nodes: readonly ViewNodeDto[]): number {
  return nodes.reduce((sum, node) => sum + 1 + nodeCount(node.nodes), 0);
}

function shouldUseWorker(model: ModelDto, viewId: string, thresholds: LayoutWorkerThresholds): boolean {
  const view = model.views.find((item) => item.id === viewId);
  if (!view) return false;
  const limits = threshold(thresholds);
  const nodes = nodeCount(view.nodes);
  const connections = view.connections.length;
  return nodes >= limits.minNodes || connections >= limits.minConnections ||
    nodes + connections * 2 >= limits.minComplexity;
}

function canUseWorker(): boolean {
  return typeof Worker === 'function';
}

function createWorker(): Worker {
  return new Worker(new URL('./worker-entry.js', import.meta.url), {
    type: 'module',
    name: 'archimate-js-layout'
  });
}

function settleWith(response: unknown, id: number): LayoutResult | undefined {
  const parsed = parseLayoutWorkerResponse(response, id);
  if (!parsed) return undefined;
  if (parsed.ok) return parsed.result;
  return workerFailure();
}

function send(worker: Worker, id: number, model: unknown, viewId: string,
  options: LayoutOptions): boolean {
  try {
    worker.postMessage(layoutWorkerRequest(id, model, viewId, options));
    return true;
  } catch {
    return false;
  }
}

function workerFailure(): LayoutResult {
  return diagnostic('LAYOUT_FAILED', 'The layout worker could not compute the selected view.');
}

function runWorker(model: unknown, viewId: string, options: LayoutOptions,
  timeoutMs: number, signal?: AbortSignal): Promise<LayoutResult> {
  if (signal?.aborted) return Promise.resolve(diagnostic('LAYOUT_CANCELLED', 'Layout was cancelled.'));
  let worker: Worker;
  try { worker = createWorker(); }
  catch { return Promise.resolve(diagnostic('WORKER_UNAVAILABLE', 'The layout worker is unavailable.')); }
  return new Promise((resolve) => {
    const id = nextRequestId++;
    let settled = false;
    const finish = (result: LayoutResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', failure);
      worker.terminate();
    };
    const abort = (): void => finish(diagnostic('LAYOUT_CANCELLED', 'Layout was cancelled.'));
    const failure = (): void => finish(workerFailure());
    const message = (event: MessageEvent<unknown>): void => {
      const result = settleWith(event.data, id);
      if (result) finish(result);
    };
    const timer = setTimeout(() => finish(diagnostic('LAYOUT_TIMEOUT',
      'The layout worker exceeded the configured timeout.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', message);
    worker.addEventListener('error', failure);
    if (!send(worker, id, model, viewId, options)) finish(workerFailure());
  });
}

export async function layoutViewInBrowser(input: unknown, viewId: string,
  options: LayoutExecutionOptions): Promise<LayoutResult> {
  const coreOptions = layoutOptions(options);
  const execution = options.execution ?? 'auto';
  if (execution === 'main-thread') return layoutView(input, viewId, coreOptions);
  let model: ModelDto;
  try { model = validateModelDto(input); }
  catch { return layoutView(input, viewId, coreOptions); }
  const selected = execution === 'worker' ||
    shouldUseWorker(model, viewId, options.workerThresholds ?? {});
  if (!selected) return layoutView(model, viewId, coreOptions);
  if (!canUseWorker()) {
    return execution === 'worker' ? diagnostic('WORKER_UNAVAILABLE',
      'The layout worker is unavailable.') : layoutView(model, viewId, coreOptions);
  }
  return runWorker(model, viewId, coreOptions, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);
}
