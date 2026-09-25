import type {
  CanvasProjection,
  EditorCommand,
  EditorEvent
} from '../model-dto/editor.js';
import type { DtoEditingReason } from '../model-dto/eligibility.js';
import {
  createDiagramJsCapabilities,
  createDiagramJsModeler,
  DtoModelerSession,
  fitDiagramJsView,
  zoomDiagramJsCanvas,
  DiagramJsCanvasPort
} from '../diagram-js-adapter/index.js';
import type {
  DiagramJsCapabilities,
  DiagramJsModelerInstance,
  DtoSaveResult
} from '../diagram-js-adapter/index.js';

export { DiagramJsCanvasPort, DtoModelerSession };
export type { DiagramJsCanvasServices } from '../diagram-js-adapter/index.js';
export type { DtoModelerServices, DtoSaveResult } from '../diagram-js-adapter/index.js';
export type { CanvasProjection, EditorCommand } from '../model-dto/editor.js';

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
  | { type: 'selection'; viewId: string; selectedIds: string[]; model: EditorEvent['model'] };

export class ModelerError extends Error {
  constructor(readonly code: 'MODELER_DESTROYED' | 'MODELER_SESSION_INELIGIBLE') {
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
  private readonly listeners = new Map<ModelerEvent['type'], Set<(event: ModelerEvent) => void>>();

  constructor(options: ModelerOptions) {
    this.modeler = createDiagramJsModeler(options);
  }

  async open(xml: string, options: { viewId?: string } = {}): Promise<OpenResult> {
    this.assertUsable();
    this.close();
    const session = await DtoModelerSession.open(this.modeler, xml, options.viewId);
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
    fitDiagramJsView(this.modeler);
  }

  zoom(level: number | 'fit'): number | undefined {
    this.assertUsable();
    return zoomDiagramJsCanvas(this.modeler, level);
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
    if (!this.session) return;
    this.offEditor?.();
    this.offEditor = undefined;
    this.session.close();
    this.session = undefined;
    this.viewId = undefined;
    this.emit({ type: 'closed' });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.listeners.clear();
    this.modeler.destroy?.();
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
