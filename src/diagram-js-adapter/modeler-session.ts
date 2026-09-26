import { DiagramJsCanvasPort, type DiagramJsCanvasServices,
  type QuickCreateRequester, type RelationshipTypeRequester } from './canvas-port.js';
import {
  createDtoEditorFromMeff, editingIneligibleError, type DtoEditingReason
} from '../model-dto/eligibility.js';
import type { DiagramAdapter } from '../model-dto/editor.js';
import type { SemanticProfile } from '../language/semantic-profile.mjs';

/** A narrow, structural interface; the legacy Modeler remains free to serve other imports. */
export interface DtoModelerServices {
  importXML(xml: string, viewId?: string): Promise<unknown>;
  getModel(): unknown;
  get(service: string): unknown;
}

interface DirectEditingService {
  activate(element: unknown): boolean;
}

interface ElementRegistryService {
  get(id: string): unknown;
}

export interface DtoSaveResult { xml: string; dtoJson: string }

/** One import owns one editor history. Reimporting the Modeler invalidates this session. */
export class DtoModelerSession {
  readonly eligible: boolean;
  readonly reasons: readonly DtoEditingReason[];
  readonly editor?: DiagramAdapter;
  private readonly importedModel: unknown;
  private readonly detach?: () => void;
  private readonly canvasPort?: DiagramJsCanvasPort;
  private readonly offNativeMutation?: () => void;
  private nativeMutation = false;
  private closed = false;

  private constructor(private readonly modeler: DtoModelerServices, xml: string, viewId?: string,
    requestRelationshipType?: RelationshipTypeRequester, requestQuickCreate?: QuickCreateRequester,
    semanticProfile?: SemanticProfile) {
    this.importedModel = modeler.getModel();
    const entry = createDtoEditorFromMeff(xml, { semanticProfile });
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
    const port = new DiagramJsCanvasPort(services, requestRelationshipType, requestQuickCreate);
    this.canvasPort = port;
    this.detach = entry.editor.attach(activeViewId, port);
    this.editor = entry.editor;
    const markMutation = (): void => { this.nativeMutation = true; };
    services.eventBus.on('commandStack.executed', markMutation);
    this.offNativeMutation = () => services.eventBus.off('commandStack.executed', markMutation);
  }

  /** Import first so an ineligible session keeps the complete original moddle model. */
  static async open(modeler: DtoModelerServices, xml: string, viewId?: string,
    requestRelationshipType?: RelationshipTypeRequester,
    requestQuickCreate?: QuickCreateRequester,
    semanticProfile?: SemanticProfile): Promise<DtoModelerSession> {
    await modeler.importXML(xml, viewId);
    return new DtoModelerSession(modeler, xml, viewId, requestRelationshipType,
      requestQuickCreate, semanticProfile);
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

  startElementNameEditing(nodeId: string): void {
    if (this.closed || !this.canvasPort) throw editingIneligibleError();
    const registry = this.modeler.get('elementRegistry') as ElementRegistryService | undefined;
    if (!registry || typeof registry.get !== 'function') {
      throw new Error('MODELER_ELEMENT_REGISTRY_UNAVAILABLE');
    }
    const shape = registry.get(nodeId);
    if (!shape) throw new Error('MODELER_CREATED_NODE_UNAVAILABLE');
    const directEditing = this.modeler.get('directEditing') as DirectEditingService | undefined;
    if (!directEditing || typeof directEditing.activate !== 'function') {
      throw new Error('MODELER_DIRECT_EDITING_UNAVAILABLE');
    }
    if (!directEditing.activate(shape)) throw new Error('MODELER_NAME_EDIT_UNAVAILABLE');
    this.canvasPort.beginSemanticNameEdit(nodeId);
  }
}
