import type {
  CanvasProjection,
  EditorCommand,
  EditorEvent
} from '../model-dto/editor.js';
import { assessModelDtoEditingEligibility, type DtoEditingReason } from '../model-dto/eligibility.js';
import { layoutView, type LayoutDiagnostic, type LayoutOptions,
  type LayoutPatch, type LayoutResult } from '../layout/index.js';
import {
  createDiagramJsCapabilities,
  createDiagramJsViewport,
  createDiagramJsModeler,
  DtoModelerSession,
  DiagramJsCanvasPort
} from '../diagram-js-adapter/index.js';
import type {
  DiagramJsCapabilities,
  DiagramJsViewport,
  DiagramJsViewportState,
  DiagramJsModelerInstance,
  DtoSaveResult
} from '../diagram-js-adapter/index.js';
import type { EditorOperationLog } from '../model-dto/editor-operation-log.js';

export { DiagramJsCanvasPort, DtoModelerSession };
export { EditorOperationLogError } from '../model-dto/editor-operation-log.js';
export type { DiagramJsCanvasServices } from '../diagram-js-adapter/index.js';
export type { DtoModelerServices, DtoSaveResult } from '../diagram-js-adapter/index.js';
export type { CanvasProjection, EditorCommand } from '../model-dto/editor.js';
export type {
  EditorOperation, EditorOperationAction, EditorOperationLog, EditorOperationLogErrorCode
} from '../model-dto/editor-operation-log.js';
export type { LayoutOptions, LayoutPatch, LayoutMetrics } from '../layout/index.js';

export interface ModelerOptions {
  container: Element;
  width?: number | string;
  height?: number | string;
}

export interface OpenResult {
  eligible: boolean;
  reasons: readonly DtoEditingReason[];
  viewId?: string;
}

export type ModelerEvent =
  | { type: 'opened'; eligible: boolean; reasons: readonly DtoEditingReason[]; viewId?: string }
  | { type: 'closed' }
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
  private destroyed = false;
  private generation = 0;
  private readonly viewport: DiagramJsViewport;
  private readonly offViewport: () => void;
  private readonly listeners = new Map<ModelerEvent['type'], Set<(event: ModelerEvent) => void>>();

  constructor(options: ModelerOptions) {
    this.modeler = createDiagramJsModeler(options);
    this.viewport = createDiagramJsViewport(this.modeler);
    this.offViewport = this.viewport.onViewport((viewport) => this.emit({ type: 'viewport', ...viewport }));
  }

  async open(xml: string, options: { viewId?: string } = {}): Promise<OpenResult> {
    this.assertUsable();
    const generation = ++this.generation;
    this.closeCurrent();
    const session = await DtoModelerSession.open(this.modeler, xml, options.viewId);
    if (this.destroyed || generation !== this.generation) {
      session.close();
      throw new ModelerError(this.destroyed ? 'MODELER_DESTROYED' : 'MODELER_OPEN_SUPERSEDED');
    }
    this.session = session;
    this.viewId = options.viewId || session.editor?.getModel().views[0]?.id;
    if (session.editor) this.offEditor = session.editor.subscribe((event) => this.emitEditor(event));
    const result = { eligible: session.eligible, reasons: session.reasons, viewId: this.viewId };
    this.emit({ type: 'opened', ...result });
    return result;
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

  project(): CanvasProjection {
    return this.editor().project(this.activeViewId());
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

  private emit(event: ModelerEvent): void {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
  }
}
