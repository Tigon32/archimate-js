import { DiagramJsCanvasPort, type DiagramJsCanvasServices } from './canvas-port.js';
import {
  createDtoEditorFromMeff, editingIneligibleError, type DtoEditingReason
} from '../model-dto/eligibility.js';
import type { DiagramAdapter } from '../model-dto/editor.js';

/** A narrow, structural interface; the legacy Modeler remains free to serve other imports. */
export interface DtoModelerServices {
  importXML(xml: string, viewId?: string): Promise<unknown>;
  getModel(): unknown;
  get(service: keyof DiagramJsCanvasServices): unknown;
}

export interface DtoSaveResult { xml: string; dtoJson: string }

/** One import owns one editor history. Reimporting the Modeler invalidates this session. */
export class DtoModelerSession {
  readonly eligible: boolean;
  readonly reasons: readonly DtoEditingReason[];
  readonly editor?: DiagramAdapter;
  private readonly importedModel: unknown;
  private readonly detach?: () => void;
  private readonly offNativeMutation?: () => void;
  private nativeMutation = false;
  private closed = false;

  private constructor(private readonly modeler: DtoModelerServices, xml: string, viewId?: string) {
    this.importedModel = modeler.getModel();
    const entry = createDtoEditorFromMeff(xml);
    this.eligible = entry.eligible;
    this.reasons = entry.reasons;
    if (!entry.eligible) return;
    const activeViewId = viewId || entry.model.views[0]?.id;
    if (!activeViewId) throw editingIneligibleError();
    const services = {
      canvas: modeler.get('canvas'), elementFactory: modeler.get('elementFactory'),
      eventBus: modeler.get('eventBus'), selection: modeler.get('selection'),
      modeling: modeler.get('modeling')
    } as DiagramJsCanvasServices;
    const port = new DiagramJsCanvasPort(services);
    this.detach = entry.editor.attach(activeViewId, port);
    this.editor = entry.editor;
    const markMutation = (): void => { this.nativeMutation = true; };
    services.eventBus.on('commandStack.executed', markMutation);
    this.offNativeMutation = () => services.eventBus.off('commandStack.executed', markMutation);
  }

  /** Import first so an ineligible session keeps the complete original moddle model. */
  static async open(modeler: DtoModelerServices, xml: string, viewId?: string): Promise<DtoModelerSession> {
    await modeler.importXML(xml, viewId);
    return new DtoModelerSession(modeler, xml, viewId);
  }

  /** The caller writes only after both full, validated outputs have been produced. */
  save(): DtoSaveResult {
    if (this.closed || !this.editor || this.nativeMutation ||
        this.modeler.getModel() !== this.importedModel) {
      throw editingIneligibleError();
    }
    const xml = this.editor.exportMeff();
    const dtoJson = this.editor.serialize();
    return { xml, dtoJson };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.offNativeMutation?.();
    this.detach?.();
  }
}
