import { layoutView } from './core.js';
import { isLayoutWorkerRequest } from './worker-protocol.js';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './worker-protocol.js';

type WorkerScope = {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null;
  postMessage(message: LayoutWorkerResponse): void;
};

const scope = globalThis as unknown as WorkerScope;

async function handle(request: LayoutWorkerRequest): Promise<LayoutWorkerResponse> {
  try {
    const result = await layoutView(request.model, request.viewId, request.options);
    return { protocol: request.protocol, id: request.id, ok: true, result };
  } catch {
    return { protocol: request.protocol, id: request.id, ok: false, code: 'LAYOUT_FAILED' };
  }
}

scope.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const request = event.data;
  if (!isLayoutWorkerRequest(request)) return;
  void handle(request).then((response) => scope.postMessage(response));
};
