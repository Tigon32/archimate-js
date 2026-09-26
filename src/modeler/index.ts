import type {
  CanvasProjection,
  EditorCommand,
  EditorEvent
} from '../model-dto/editor.js';
import { assessModelDtoEditingEligibility, type DtoEditingReason } from '../model-dto/eligibility.js';
import { layoutView, type LayoutDiagnostic, type LayoutOptions,
  type LayoutPatch, type LayoutResult } from '../layout/index.js';
import {
  attachConceptPicker,
  attachProductivityToolbar,
  createDiagramJsCapabilities,
  createDiagramJsViewport,
  createDiagramJsModeler,
  DtoModelerSession,
  DiagramJsCanvasPort
} from '../diagram-js-adapter/index.js';
import type {
  DiagramJsCapabilities,
  ConceptPickerEditorService,
  DiagramJsViewport,
  DiagramJsViewportState,
  DiagramJsModelerInstance,
  DtoSaveResult,
  QuickCreateRequest,
  RelationshipTypeRequest
} from '../diagram-js-adapter/index.js';
import type { EditorOperationLog } from '../model-dto/editor-operation-log.js';
import type { ModelDto } from '../model-dto/types.js';
import { parseSemanticProfile } from '../language/relationship-semantics.mjs';
import type { SemanticProfile } from '../language/semantic-profile.mjs';
import {
  evaluateRelationshipChoices,
  quickCreateCandidates,
  QuickCreateChooser,
  RelationshipChooser
} from './relationship-chooser.js';
import type { QuickCreateCandidate, RelationshipChoice } from './relationship-chooser.js';
import {
  alignSelectionCommand,
  distributeSelectionCommand,
  duplicateSelectionCommand
} from './productivity.js';
import type { Alignment, DistributionAxis } from './productivity.js';

export { DiagramJsCanvasPort, DtoModelerSession };
export { EditorOperationLogError } from '../model-dto/editor-operation-log.js';
export type { DiagramJsCanvasServices } from '../diagram-js-adapter/index.js';
export type { DtoModelerServices, DtoSaveResult } from '../diagram-js-adapter/index.js';
export type { CanvasProjection, EditorCommand } from '../model-dto/editor.js';
export type {
  EditorOperation, EditorOperationAction, EditorOperationLog, EditorOperationLogErrorCode
} from '../model-dto/editor-operation-log.js';
export type { LayoutOptions, LayoutPatch, LayoutMetrics } from '../layout/index.js';
export type { Alignment, DistributionAxis } from './productivity.js';

export interface ModelerOptions {
  container: Element;
  width?: number | string;
  height?: number | string;
  semanticProfile?: unknown;
}

function createConceptIdFactory(editor: { getModel(): ModelDto }): (kind: string) => string {
  let sequence = 1;
  return (kind) => {
    const used = collectModelIds(editor.getModel());
    let id: string;
    do {
      id = `concept-${kind}-${sequence++}`;
    } while (used.has(id));
    return id;
  };
}

function collectModelIds(model: ModelDto): Set<string> {
  const ids = new Set<string>();
  const stack: unknown[] = [model];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'id' && typeof child === 'string') ids.add(child);
        else if (child && typeof child === 'object') stack.push(child);
      }
    }
  }
  return ids;
}

export interface OpenResult {
  eligible: boolean;
  reasons: readonly DtoEditingReason[];
  viewId?: string;
}

export interface ModelerView {
  id: string;
  name?: string;
}

export type ModelerEvent =
  | { type: 'opened'; eligible: boolean; reasons: readonly DtoEditingReason[]; viewId?: string }
  | { type: 'closed' }
  | { type: 'view-switched'; viewId: string; selectedIds: string[]; model: EditorEvent['model'] }
  | { type: 'changed'; viewId: string; selectedIds: string[]; model: EditorEvent['model'] }
  | { type: 'selection'; viewId: string; selectedIds: string[]; model: EditorEvent['model'] }
  | ({ type: 'viewport' } & DiagramJsViewportState);

export class ModelerError extends Error {
  constructor(readonly code: 'MODELER_DESTROYED' | 'MODELER_OPEN_SUPERSEDED' |
    'MODELER_SESSION_INELIGIBLE' | LayoutDiagnostic['code']) {
    super(code);
    this.name = 'ModelerError';
  }
}

type EventHandler<T extends ModelerEvent['type']> = (event: Extract<ModelerEvent, { type: T }>) => void;

export default class Modeler {
  private readonly modeler: DiagramJsModelerInstance;
  private session?: DtoModelerSession;
  private viewId?: string;
  private offEditor?: () => void;
  private offConceptPicker?: () => void;
  private offProductivityToolbar?: () => void;
  private activeRelationshipChooser?: RelationshipChooser;
  private activeQuickCreateChooser?: QuickCreateChooser;
  private destroyed = false;
  private generation = 0;
  private readonly viewport: DiagramJsViewport;
  private readonly offViewport: () => void;
  private readonly listeners = new Map<ModelerEvent['type'], Set<(event: ModelerEvent) => void>>();
  private readonly semanticProfile?: SemanticProfile;

  constructor(options: ModelerOptions) {
    this.semanticProfile = options.semanticProfile === undefined ? undefined :
      parseSemanticProfile(options.semanticProfile);
    this.modeler = createDiagramJsModeler(options);
    this.viewport = createDiagramJsViewport(this.modeler);
    this.offViewport = this.viewport.onViewport((viewport) => this.emit({ type: 'viewport', ...viewport }));
  }

  async open(xml: string, options: { viewId?: string } = {}): Promise<OpenResult> {
    this.assertUsable();
    const generation = ++this.generation;
    this.closeCurrent();
    const session = await DtoModelerSession.open(this.modeler, xml, options.viewId,
      (request) => this.handleRelationshipTypeRequest(request),
      (request) => this.handleQuickCreateRequest(request),
      this.semanticProfile,
      (ids, offset) => this.duplicateIds(ids, offset));
    if (this.destroyed || generation !== this.generation) {
      session.close();
      throw new ModelerError(this.destroyed ? 'MODELER_DESTROYED' : 'MODELER_OPEN_SUPERSEDED');
    }
    this.session = session;
    this.viewId = session.activeViewId();
    if (session.editor) {
      const editor = session.editor;
      this.offEditor = editor.subscribe((event) => this.emitEditor(event));
      if (this.viewId) {
        this.attachConceptPicker(session, editor, this.viewId);
        this.offProductivityToolbar = attachProductivityToolbar(this.modeler, {
          duplicate: (offset) => this.duplicateSelection(offset),
          align: (alignment) => this.alignSelection(alignment),
          distribute: (axis) => this.distributeSelection(axis),
          deleteSelection: () => this.deleteSelection()
        });
      }
    }
    const result = { eligible: session.eligible, reasons: session.reasons, viewId: this.viewId };
    this.emit({ type: 'opened', ...result });
    return result;
  }

  private handleRelationshipTypeRequest(request: RelationshipTypeRequest): void {
    const choice: RelationshipChoice =
      evaluateRelationshipChoices(request.sourceType, request.targetType, this.semanticProfile);
    this.closeChoiceDialogs();
    if (choice.status === 'default') {
      request.choose(choice.allowed[0].type);
      return;
    }
    this.activeRelationshipChooser = new RelationshipChooser({
      choice,
      onChoose: (candidate) => request.choose(candidate.type)
    });
  }

  private handleQuickCreateRequest(request: QuickCreateRequest): void {
    const editor = this.session?.editor;
    const viewId = this.viewId;
    if (!editor || !viewId) return;
    this.closeChoiceDialogs();
    this.activeQuickCreateChooser = new QuickCreateChooser({
      sourceType: request.sourceType,
      candidates: quickCreateCandidates(request.sourceType, this.semanticProfile),
      onChoose: (candidate) => this.commitQuickCreate(
        request, candidate, editor, viewId, createConceptIdFactory(editor))
    });
  }

  private commitQuickCreate(request: QuickCreateRequest, candidate: QuickCreateCandidate,
    editor: NonNullable<DtoModelerSession['editor']>, viewId: string,
    createId: (kind: string) => string): void {
    if (editor !== this.session?.editor || this.viewId !== viewId) {
      throw new ModelerError('MODELER_OPEN_SUPERSEDED');
    }
    const sourceNode = editor.project(viewId).nodes.find((node) =>
      node.id === request.sourceNodeId);
    if (!sourceNode) throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    const elementId = createId('element');
    const nodeId = createId('node');
    const relationshipId = createId('relationship');
    const connectionId = createId('connection');
    const x = Math.round(request.position.x - 70);
    const y = Math.round(request.position.y - 35);
    request.execute({
      type: 'create-related-element',
      viewId,
      element: { id: elementId, type: `archimate:${candidate.concept.type}` },
      node: { id: nodeId, kind: 'element', elementId, x, y, width: 140, height: 70, nodes: [] },
      relationship: { id: relationshipId, type: `archimate:${candidate.relationship.type}`,
        sourceId: request.sourceElementId, targetId: elementId },
      connection: { id: connectionId, kind: 'relationship', relationshipId,
        sourceId: request.sourceNodeId, targetId: nodeId, waypoints: [
          { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2,
            kind: 'sourceAttachment' },
          { x: request.position.x, y: request.position.y, kind: 'targetAttachment' }
        ] }
    });
    this.session?.startElementNameEditing(nodeId);
  }

  private closeChoiceDialogs(): void {
    this.activeRelationshipChooser?.close(false);
    this.activeRelationshipChooser = undefined;
    this.activeQuickCreateChooser?.close(false);
    this.activeQuickCreateChooser = undefined;
  }

  save(): DtoSaveResult {
    this.assertUsable();
    if (!this.session?.eligible) throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    return this.session.save();
  }

  execute(command: EditorCommand): void {
    this.editor().execute(command);
  }

  exportOperationLog(clientId: string): EditorOperationLog {
    return this.editor().exportOperationLog(clientId);
  }

  serializeOperationLog(clientId: string): string {
    return this.editor().serializeOperationLog(clientId);
  }

  replayOperationLog(input: unknown): void {
    this.editor().replayOperationLog(input);
  }

  async optimizeDiagram(options: Partial<LayoutOptions> = {}): Promise<
    Pick<Extract<LayoutResult, { status: 'ok' }>, 'patch' | 'metrics'>> {
    const editor = this.editor();
    const viewId = this.activeViewId();
    const generation = this.generation;
    const model = editor.getModel();
    const result = await layoutView(model, viewId, { strategy: 'builtin', ...options });
    if (this.destroyed || generation !== this.generation || editor !== this.session?.editor) {
      throw new ModelerError(this.destroyed ? 'MODELER_DESTROYED' : 'MODELER_OPEN_SUPERSEDED');
    }
    if (result.status !== 'ok') throw new ModelerError(result.diagnostics[0].code);
    const candidate = { ...model, views: model.views.map((view) =>
      view.id === viewId ? result.view : view) };
    if (!assessModelDtoEditingEligibility(candidate).eligible) throw new ModelerError('LAYOUT_FAILED');
    editor.execute({ type: 'apply-layout-patch', viewId, patch: result.patch, side: 'after' });
    return { patch: result.patch, metrics: result.metrics };
  }

  applyLayoutPatch(patch: LayoutPatch, side: 'before' | 'after'): void {
    this.editor().execute({ type: 'apply-layout-patch', viewId: this.activeViewId(), patch, side });
  }

  undo(): boolean {
    return this.editor().undo();
  }

  redo(): boolean {
    return this.editor().redo();
  }

  select(ids: string[]): void {
    this.editor().select(this.activeViewId(), ids);
  }

  getSelection(): string[] {
    return this.project().selectedIds;
  }

  duplicateSelection(offset = { x: 20, y: 20 }): string[] {
    return this.duplicateIds(this.getSelection(), offset);
  }

  alignSelection(alignment: Alignment): boolean {
    const command = alignSelectionCommand(this.project(), alignment);
    if (!command) return false;
    this.editor().execute(command);
    return true;
  }

  distributeSelection(axis: DistributionAxis): boolean {
    const command = distributeSelectionCommand(this.project(), axis);
    if (!command) return false;
    this.editor().execute(command);
    return true;
  }

  deleteSelection(): boolean {
    const itemIds = this.getSelection();
    if (!itemIds.length) return false;
    this.editor().execute({ type: 'delete-many', viewId: this.activeViewId(), itemIds });
    return true;
  }

  project(): CanvasProjection {
    return this.editor().project(this.activeViewId());
  }

  getViews(): ModelerView[] {
    return this.editor().getModel().views.map(({ id, name }) =>
      name === undefined ? { id } : { id, name });
  }

  getActiveViewId(): string {
    return this.activeViewId();
  }

  switchView(viewId: string): CanvasProjection {
    const session = this.currentSession();
    const editor = this.editor();
    const projection = session.switchView(viewId);
    this.viewId = viewId;
    this.closeChoiceDialogs();
    this.offConceptPicker?.();
    this.offConceptPicker = undefined;
    this.attachConceptPicker(session, editor, viewId);
    this.emit({ type: 'view-switched', viewId,
      selectedIds: projection.selectedIds, model: editor.getModel() });
    return projection;
  }

  fitView(): void {
    this.assertUsable();
    this.viewport.fitView();
  }

  fitSelection(): void {
    this.assertUsable();
    this.viewport.fitSelection();
  }

  zoom(level: number | 'fit'): number | undefined {
    this.assertUsable();
    const viewport = this.viewport.zoom(level);
    return level === 'fit' ? undefined : viewport.scale;
  }

  getZoom(): number {
    this.assertUsable();
    return this.viewport.getZoom();
  }

  panBy(dx: number, dy: number): void {
    this.assertUsable();
    this.viewport.panBy(dx, dy);
  }

  on<T extends ModelerEvent['type']>(type: T, handler: EventHandler<T>): () => void {
    const handlers = this.listeners.get(type) || new Set<(event: ModelerEvent) => void>();
    handlers.add(handler as (event: ModelerEvent) => void);
    this.listeners.set(type, handlers);
    return () => handlers.delete(handler as (event: ModelerEvent) => void);
  }

  getEngineCapabilities(engine: 'diagram-js'): DiagramJsCapabilities {
    this.assertUsable();
    if (engine !== 'diagram-js') throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    return createDiagramJsCapabilities(this.modeler);
  }

  close(): void {
    this.generation += 1;
    this.closeCurrent();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.closeCurrent();
    this.destroyed = true;
    this.offViewport();
    this.listeners.clear();
    this.modeler.destroy?.();
  }

  private closeCurrent(): void {
    if (!this.session) return;
    this.offEditor?.();
    this.offEditor = undefined;
    this.offConceptPicker?.();
    this.offConceptPicker = undefined;
    this.offProductivityToolbar?.();
    this.offProductivityToolbar = undefined;
    this.activeRelationshipChooser?.close(false);
    this.activeRelationshipChooser = undefined;
    this.activeQuickCreateChooser?.close(false);
    this.activeQuickCreateChooser = undefined;
    this.session.close();
    this.session = undefined;
    this.viewId = undefined;
    this.emit({ type: 'closed' });
  }

  private editor(): NonNullable<DtoModelerSession['editor']> {
    this.assertUsable();
    if (!this.session?.editor) throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    return this.session.editor;
  }

  private currentSession(): DtoModelerSession {
    this.assertUsable();
    if (!this.session?.editor) throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    return this.session;
  }

  private duplicateIds(ids: string[], offset: { x: number; y: number }): string[] {
    const editor = this.editor();
    const command = duplicateSelectionCommand(editor.getModel(),
      { ...this.project(), selectedIds: ids }, createConceptIdFactory(editor), offset);
    if (!command) return [];
    editor.execute(command);
    const createdIds = command.nodes.map((entry) => entry.node.id);
    editor.select(this.activeViewId(), createdIds);
    return createdIds;
  }

  private activeViewId(): string {
    if (!this.viewId) throw new ModelerError('MODELER_SESSION_INELIGIBLE');
    return this.viewId;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new ModelerError('MODELER_DESTROYED');
  }

  private emitEditor(event: EditorEvent): void {
    this.emit({ type: event.type, viewId: event.viewId,
      selectedIds: event.selectedIds, model: event.model });
  }

  private attachConceptPicker(session: DtoModelerSession,
    editor: NonNullable<DtoModelerSession['editor']>, viewId: string): void {
    const idFactory = createConceptIdFactory(editor);
    this.offConceptPicker = attachConceptPicker({
      modeler: this.modeler,
      viewId,
      editor: {
        createId: idFactory,
        execute: (command) => editor.execute(command),
        startNameEditing: (nodeId) => session.startElementNameEditing(nodeId)
      } satisfies ConceptPickerEditorService
    });
  }

  private emit(event: ModelerEvent): void {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
  }
}
