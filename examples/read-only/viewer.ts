import { createViewerSelectionAdapter, type ViewerSelectionAdapter } from './outline-bridge.js';

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
const FIXTURE_PATH = '../../test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const MAX_FIXTURE_BYTES = 256 * 1024;

interface OutlineEntry {
  id: string;
  label: string;
  context: string;
  category: 'element' | 'relationship';
}

let activeSelectionAdapter: ViewerSelectionAdapter | undefined;

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

function contextLabel(path: string[]): string {
  return path.length ? `Context: ${path.join(' / ')}` : 'Context: top level';
}

function makeOutlineButton(entry: OutlineEntry): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'outline-item-button';
  button.dataset.outlineId = entry.id;
  button.dataset.outlineCategory = entry.category;
  button.setAttribute('aria-pressed', 'false');
  button.textContent = entry.label;
  const context = document.createElement('span');
  context.className = 'outline-item-context';
  context.textContent = ` (${entry.context}; id ${entry.id})`;
  button.append(context);
  button.addEventListener('click', () => activateOutlineEntry(button));
  button.addEventListener('keydown', onOutlineKeydown);
  return button;
}

function appendNode(node: OutlineNode, list: HTMLUListElement, path: string[]): void {
  const item = document.createElement('li');
  const nextPath = [...path, node.name];
  const button = makeOutlineButton({ id: node.id, label: labelFor(node.type, node.name),
    context: contextLabel(path), category: 'element' });
  if (node.children.length) {
    const disclosure = document.createElement('details');
    disclosure.open = true;
    const summary = document.createElement('summary');
    summary.append(button);
    const children = document.createElement('ul');
    node.children.forEach((child) => appendNode(child, children, nextPath));
    disclosure.append(summary, children);
    item.append(disclosure);
  } else {
    item.append(button);
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
  list.setAttribute('aria-labelledby', 'outline-relationships-heading');
  for (const relation of relations) {
    const item = document.createElement('li');
    item.append(makeOutlineButton({ id: relation.id, label: relationshipLabel(relation, names),
      context: 'relationship in selected view', category: 'relationship' }));
    list.append(item);
  }
  host.replaceChildren(list);
}

export function renderAccessibleOutline(outline: OutlineData, elementsHost: HTMLElement,
  relationshipsHost: HTMLElement): void {
  const names = new Map<string, string>();
  collectNames(outline.nodes, names);
  const list = document.createElement('ul');
  for (const node of outline.nodes) appendNode(node, list, []);
  list.setAttribute('aria-labelledby', 'outline-elements-heading');
  elementsHost.replaceChildren(list);
  renderRelationships(outline.relationships, names, relationshipsHost);
  updateSearchResults('');
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

export async function renderExample(): Promise<void> {
  let xml: string | undefined;
  try {
    xml = await loadSyntheticFixture(FIXTURE_PATH);
  } catch {
    showFailure();
  }
  if (!xml) {
    await renderOutline(window.ArchimateModelDto);
    return;
  }

  try {
    const viewerApi = window.ArchimateJS;
    if (typeof viewerApi?.mountViewer !== 'function') throw new Error('Viewer API unavailable');
    const viewer = await viewerApi.mountViewer({ xml, viewId: VIEW_ID, container: requireElement('#diagram'),
      width: '100%', height: '100%' });
    bindViewerSelection(createViewerSelectionAdapter(viewer));
    const status = requireElement('#status');
    status.dataset.state = 'success';
    status.textContent = 'Loaded the public synthetic service delivery example.';
  } catch {
    // Keep parser, network, and model details out of the page and browser console.
    showFailure();
  }
  await renderOutline(window.ArchimateModelDto, xml);
}

function outlineButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-outline-id]'));
}

function setActiveButton(id: string | undefined): void {
  for (const button of outlineButtons()) {
    const active = Boolean(id && button.dataset.outlineId === id);
    button.setAttribute('aria-pressed', String(active));
    button.toggleAttribute('data-selected', active);
    if (active && document.activeElement === document.body) button.focus();
  }
  document.dispatchEvent(new CustomEvent('archimate-viewer-selection-change', {
    detail: { selectedIds: id ? [id] : [] }
  }));
}

function bindViewerSelection(adapter: ViewerSelectionAdapter | undefined): void {
  activeSelectionAdapter?.dispose();
  activeSelectionAdapter = adapter;
  if (!adapter) return;
  adapter.onSelectionChange((ids) => setActiveButton(ids[0]));
}

function activateOutlineEntry(button: HTMLButtonElement): void {
  const id = button.dataset.outlineId;
  if (!id || !activeSelectionAdapter?.selectById(id)) {
    setActiveButton(undefined);
    activeSelectionAdapter?.clearSelection();
    document.dispatchEvent(new CustomEvent('archimate-outline-activate', {
      detail: { id, selected: false }
    }));
    return;
  }
  setActiveButton(id);
  document.dispatchEvent(new CustomEvent('archimate-outline-activate', {
    detail: { id, selected: true }
  }));
}

function onOutlineKeydown(event: KeyboardEvent): void {
  const button = event.currentTarget as HTMLButtonElement;
  const buttons = outlineButtons();
  const index = buttons.indexOf(button);
  const targetIndex = event.key === 'ArrowDown' ? index + 1 :
    event.key === 'ArrowUp' ? index - 1 : -1;
  if (targetIndex >= 0 && targetIndex < buttons.length) {
    event.preventDefault();
    buttons[targetIndex].focus();
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activateOutlineEntry(button);
  }
}

function updateSearchResults(query: string): void {
  const normalized = query.trim().toLowerCase();
  let firstMatch: HTMLButtonElement | undefined;
  for (const button of outlineButtons()) {
    const matches = !normalized || (button.textContent ?? '').toLowerCase().includes(normalized);
    button.closest('li')?.toggleAttribute('hidden', !matches);
    firstMatch ??= matches ? button : undefined;
  }
  const status = document.querySelector<HTMLElement>('#outline-search-status');
  if (status) status.textContent = normalized && !firstMatch ? 'No outline matches.' : '';
}

function installOutlineSearch(): void {
  const search = document.querySelector<HTMLInputElement>('#outline-search');
  if (!search || search.dataset.outlineSearchReady) return;
  search.dataset.outlineSearchReady = 'true';
  search.addEventListener('input', () => updateSearchResults(search.value));
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const first = outlineButtons().find((button) => !button.closest('li')?.hasAttribute('hidden'));
    if (!first) return;
    event.preventDefault();
    first.focus();
    activateOutlineEntry(first);
  });
}

async function renderOutline(modelDtoApi: ModelDtoBrowserApi | undefined,
  sourceXml?: string): Promise<void> {
  const status = requireElement('#outline-status');
  try {
    if (typeof modelDtoApi?.importMeffToModelDto !== 'function' ||
        typeof modelDtoApi.createAccessibleOutline !== 'function') throw new Error('DTO API unavailable');
    if (!sourceXml) throw new Error('No supported model input');
    const model = modelDtoApi.importMeffToModelDto(sourceXml);
    const outline = modelDtoApi.createAccessibleOutline(model, VIEW_ID, {
      grouping: 'containment', includeRelationships: true, includeDocumentation: false
    });
    renderAccessibleOutline(outline, requireElement('#outline-content'),
      requireElement('#outline-relationships'));
    installOutlineSearch();
    status.textContent = 'Loaded the supported synthetic MEFF view outline.';
  } catch {
    status.textContent = 'Text outline unavailable for this model format.';
  }
}

void renderExample();
