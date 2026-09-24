interface ViewerBrowserApi {
  mountViewer(options: { xml: string; viewId: string; container: HTMLElement;
    width: string; height: string }): Promise<unknown>;
}

interface OutlineNode {
  id: string;
  type: string;
  name: string;
  children: OutlineNode[];
}

interface OutlineRelationship {
  id: string;
  type: string;
  name: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}

interface OutlineData {
  nodes: OutlineNode[];
  relationships: OutlineRelationship[];
}

interface ModelDtoBrowserApi {
  importMeffToModelDto(xml: unknown): unknown;
  createAccessibleOutline(model: unknown, viewId: string, options: {
    grouping: 'containment'; includeRelationships: boolean; includeDocumentation: boolean;
  }): OutlineData;
}

declare global {
  interface Window {
    ArchimateJS?: ViewerBrowserApi;
    ArchimateModelDto?: ModelDtoBrowserApi;
  }
}

const VIEW_ID = 'view-synthetic-showcase';
const FIXTURE_PATH = '../../test/fixtures/synthetic/read-only-showcase.xml';
const OUTLINE_FIXTURE_PATH = '../../test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const MAX_FIXTURE_BYTES = 256 * 1024;

async function readLimitedResponse(response: Response): Promise<Uint8Array> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('Fixture stream unavailable');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_FIXTURE_BYTES) throw new Error('Fixture exceeds example size limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function loadSyntheticFixture(fixturePath: string): Promise<string> {
  const fixtureUrl = new URL(fixturePath, import.meta.url);
  if (fixtureUrl.origin !== window.location.origin) throw new Error('Fixture must be same-origin');
  const response = await fetch(fixtureUrl, { credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error('Fixture request failed');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FIXTURE_BYTES) {
    throw new Error('Fixture exceeds example size limit');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedResponse(response));
}

function labelFor(type: string, name: string): string {
  return `${type}: ${name}`;
}

function appendNode(node: OutlineNode, list: HTMLUListElement): void {
  const item = document.createElement('li');
  if (node.children.length) {
    const disclosure = document.createElement('details');
    disclosure.open = true;
    const summary = document.createElement('summary');
    summary.textContent = labelFor(node.type, node.name);
    const children = document.createElement('ul');
    node.children.forEach((child) => appendNode(child, children));
    disclosure.append(summary, children);
    item.append(disclosure);
  } else {
    const label = document.createElement('span');
    label.textContent = labelFor(node.type, node.name);
    item.append(label);
  }
  list.append(item);
}

function collectNames(nodes: OutlineNode[], names: Map<string, string>): void {
  for (const node of nodes) {
    names.set(node.id, node.name);
    collectNames(node.children, names);
  }
}

function relationshipLabel(relation: OutlineRelationship, names: Map<string, string>): string {
  const source = relation.sourceNodeId ? names.get(relation.sourceNodeId) ?? 'unknown node' : 'unknown node';
  const target = relation.targetNodeId ? names.get(relation.targetNodeId) ?? 'unknown node' : 'unknown node';
  return `${relation.type}: ${relation.name} (from ${source} to ${target})`;
}

function renderRelationships(relations: OutlineRelationship[], names: Map<string, string>, host: HTMLElement): void {
  const list = document.createElement('ul');
  for (const relation of relations) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = relationshipLabel(relation, names);
    item.append(label);
    list.append(item);
  }
  host.replaceChildren(list);
}

export function renderAccessibleOutline(outline: OutlineData, elementsHost: HTMLElement,
  relationshipsHost: HTMLElement): void {
  const names = new Map<string, string>();
  collectNames(outline.nodes, names);
  const list = document.createElement('ul');
  for (const node of outline.nodes) appendNode(node, list);
  list.setAttribute('aria-labelledby', 'outline-elements-heading');
  elementsHost.replaceChildren(list);
  renderRelationships(outline.relationships, names, relationshipsHost);
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error('Read-only example element unavailable');
  return element;
}

function showFailure(): void {
  const status = document.querySelector<HTMLElement>('#status');
  if (!status) return;
  status.dataset.state = 'error';
  status.textContent = 'Could not load or render the synthetic example. Check the local build and server instructions.';
}

async function renderExample(): Promise<void> {
  try {
    const viewerApi = window.ArchimateJS;
    if (typeof viewerApi?.mountViewer !== 'function') throw new Error('Viewer API unavailable');
    const xml = await loadSyntheticFixture(FIXTURE_PATH);
    await viewerApi.mountViewer({ xml, viewId: VIEW_ID, container: requireElement('#diagram'),
      width: '100%', height: '100%' });
    const status = requireElement('#status');
    status.dataset.state = 'success';
    status.textContent = 'Loaded the public synthetic service delivery example.';
    await renderOutline(window.ArchimateModelDto);
  } catch {
    // Keep parser, network, and model details out of the page and browser console.
    showFailure();
  }
}

async function renderOutline(modelDtoApi: ModelDtoBrowserApi | undefined): Promise<void> {
  const status = requireElement('#outline-status');
  try {
    if (typeof modelDtoApi?.importMeffToModelDto !== 'function' ||
        typeof modelDtoApi.createAccessibleOutline !== 'function') throw new Error('DTO API unavailable');
    const xml = await loadSyntheticFixture(OUTLINE_FIXTURE_PATH);
    const model = modelDtoApi.importMeffToModelDto(xml);
    const outline = modelDtoApi.createAccessibleOutline(model, VIEW_ID, {
      grouping: 'containment', includeRelationships: true, includeDocumentation: false
    });
    renderAccessibleOutline(outline, requireElement('#outline-content'),
      requireElement('#outline-relationships'));
    status.textContent = 'Loaded the supported synthetic MEFF view outline.';
  } catch {
    status.textContent = 'Text outline unavailable for this model format.';
  }
}

void renderExample();
