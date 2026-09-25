export { projectImportedModelDto } from './project.js';
export { importMeffToModelDto } from './meff-import.js';
export { exportModelDtoToMeff } from './meff-export.js';
export { validateModelDto, serializeModelDto, parseModelDto } from './validate.js';
export { createAccessibleOutline, formatAccessibleOutline } from './accessible-outline.js';
export { searchAccessibleOutline } from './outline-search.js';
export { assessModelDtoDiffEligibility, diffModelDto } from './diff.js';
export { renderModelDtoDiffOverlay } from './diff-overlay.js';
export type {
  ModelDtoDiff, ModelDtoDiffEligibility, ModelDtoDiffEligibilityCode,
  ModelDtoDiffEligibilityDiagnostic, ModelDiffChange, ModelDiffArea,
  ModelDiffKind, ModelDiffEntity, ModelDtoRenameCandidate
} from './diff.js';
export type { AccessibleOutlineSearchResult } from './outline-search.js';
export type { AccessibleOutline, AccessibleOutlineNode, AccessibleOutlineRelationship,
  AccessibleOutlineOptions } from './accessible-outline.js';
export { DiagramAdapter } from './editor.js';
import { DiagramJsCanvasPort as AdapterDiagramJsCanvasPort } from '../diagram-js-adapter/canvas-port.js';
import { DtoModelerSession as AdapterDtoModelerSession } from '../diagram-js-adapter/modeler-session.js';
import type { DiagramJsCanvasServices as AdapterDiagramJsCanvasServices } from '../diagram-js-adapter/canvas-port.js';
import type {
  DtoModelerServices as AdapterDtoModelerServices,
  DtoSaveResult as AdapterDtoSaveResult
} from '../diagram-js-adapter/modeler-session.js';
/** @deprecated Use the upcoming `archimate-js/modeler` entry planned for EE-M4 (#346). */
export const DiagramJsCanvasPort = AdapterDiagramJsCanvasPort;
/** @deprecated Use the upcoming `archimate-js/modeler` entry planned for EE-M4 (#346). */
export const DtoModelerSession = AdapterDtoModelerSession;
/** @deprecated Use the upcoming `archimate-js/modeler` entry planned for EE-M4 (#346). */
export type DiagramJsCanvasServices = AdapterDiagramJsCanvasServices;
/** @deprecated Use the upcoming `archimate-js/modeler` entry planned for EE-M4 (#346). */
export type DtoModelerServices = AdapterDtoModelerServices;
/** @deprecated Use the upcoming `archimate-js/modeler` entry planned for EE-M4 (#346). */
export type DtoSaveResult = AdapterDtoSaveResult;
export {
  assessModelDtoEditingEligibility, checkMeffEditingEligibility, createDtoEditorFromMeff
} from './eligibility.js';
export type { CanvasPort, CanvasProjection, EditorCommand, EditorEvent } from './editor.js';
export type { DtoEditingEligibility, DtoEditingReason, DtoMeffEditorEntry } from './eligibility.js';
export type {
  ConceptPropertyDto, DtoDiagnostic, ElementDto, ModelDto, PointDto, PropertyDefinitionDto,
  PropertyDefinitionType, PropertyValueDto, RelationshipDto,
  StyleDto, ViewConnectionDto, ViewDto, ViewNodeDto
} from './types.js';
