import type { DiagramAdapter } from './editor.js';
import type {
  ElementDto, ModelDto, PropertyDefinitionDto, PropertyValueDto, RelationshipDto,
  ViewConnectionDto, ViewNodeDto
} from './types.js';

export type EditorInspectorStatus = 'empty' | 'multiple' | 'unsupported' | 'ready';
export type EditorInspectorFieldAvailability = 'available' | 'read-only' | 'unavailable';
export type EditorInspectorTargetKind = 'element' | 'relationship';
export type EditorInspectorFieldKind = 'text' | 'long-text' | 'property-values' | 'reference';

export interface EditorInspectorTarget {
  kind: EditorInspectorTargetKind;
  itemId: string;
  conceptId: string;
  type: string;
}

export interface EditorInspectorField {
  key: string;
  label: string;
  kind: EditorInspectorFieldKind;
  availability: EditorInspectorFieldAvailability;
  reason?: string;
  value?: string | PropertyValueDto[];
  propertyDefinition?: PropertyDefinitionDto;
}

export interface EditorPropertiesInspection {
  viewId: string;
  selectedIds: string[];
  status: EditorInspectorStatus;
  target?: EditorInspectorTarget;
  fields: EditorInspectorField[];
  reason?: string;
}

export type EditorPropertiesInspectorListener = (inspection: EditorPropertiesInspection) => void;

type EditableConcept = ElementDto | RelationshipDto;

type InspectorEditCommand =
  | { type: 'concept-name'; name?: string }
  | { type: 'concept-documentation'; documentation?: string }
  | { type: 'property'; propertyDefinitionId: string; values: PropertyValueDto[] };

type ResolvedTarget =
  | { status: 'ready'; selectedIds: string[]; itemId: string; concept: EditableConcept;
      kind: EditorInspectorTargetKind; item: ViewNodeDto | ViewConnectionDto }
  | { status: Exclude<EditorInspectorStatus, 'ready'>; selectedIds: string[]; reason?: string;
      item?: ViewNodeDto | ViewConnectionDto };

export class EditorPropertiesInspectorError extends TypeError {
  constructor(readonly code: 'EDITOR_INSPECTOR_SELECTION_UNAVAILABLE') {
    super(code);
    this.name = 'EditorPropertiesInspectorError';
  }
}

function findNode(nodes: ViewNodeDto[], id: string): ViewNodeDto | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.nodes, id);
    if (child) return child;
  }
  return undefined;
}

function selectedIds(adapter: DiagramAdapter, viewId: string, ids?: readonly string[]): string[] {
  return ids === undefined ? adapter.project(viewId).selectedIds : [...ids];
}

function propertyValues(concept: EditableConcept, definitionId: string): PropertyValueDto[] {
  const property = concept.properties?.find((item) => item.propertyDefinitionId === definitionId);
  return structuredClone(property?.values ?? []);
}

function scalar(value: string | undefined): string {
  return value ?? '';
}

function readonlyField(key: string, label: string, value: string, reason: string): EditorInspectorField {
  return { key, label, kind: 'reference', value, availability: 'read-only', reason };
}

function unsupportedField(key: string, label: string, value: string | undefined,
  reason: string): EditorInspectorField {
  return { key, label, kind: 'reference', ...(value !== undefined ? { value } : {}),
    availability: 'unavailable', reason };
}

function editableFields(concept: EditableConcept,
  definitions: PropertyDefinitionDto[]): EditorInspectorField[] {
  return [
    { key: 'name', label: 'Name', kind: 'text', availability: 'available',
      value: scalar(concept.name) },
    { key: 'documentation', label: 'Documentation', kind: 'long-text',
      availability: 'available', value: scalar(concept.documentation) },
    ...definitions.map((definition): EditorInspectorField => ({
      key: `property:${definition.id}`,
      label: scalar(definition.name) || definition.id,
      kind: 'property-values',
      availability: 'available',
      value: propertyValues(concept, definition.id),
      propertyDefinition: structuredClone(definition)
    }))
  ];
}

function readonlyConceptFields(concept: EditableConcept): EditorInspectorField[] {
  const reason = 'Concept identity and type are outside the accepted editable DTO inspector profile.';
  const fields = [
    readonlyField('concept-id', 'Concept ID', concept.id, reason),
    readonlyField('concept-type', 'Concept type', concept.type, reason)
  ];
  if ('sourceId' in concept) fields.push(
    readonlyField('relationship-source', 'Source concept ID', concept.sourceId, reason),
    readonlyField('relationship-target', 'Target concept ID', concept.targetId, reason)
  );
  return fields;
}

function readonlyViewFields(item: ViewNodeDto | ViewConnectionDto): EditorInspectorField[] {
  const reason = 'Presentation fields are edited by canvas commands, not this profile-safe concept inspector.';
  const fields: EditorInspectorField[] = [];
  if (item.label !== undefined) {
    fields.push(unsupportedField('presentation-label', 'Presentation label', item.label, reason));
  }
  if ('style' in item && item.style !== undefined) {
    fields.push(unsupportedField('presentation-style', 'Presentation style', JSON.stringify(item.style), reason));
  }
  if ('waypoints' in item) fields.push(unsupportedField('relationship-waypoints',
    'Relationship waypoints', String(item.waypoints.length), reason));
  else fields.push(unsupportedField('node-geometry', 'Node geometry',
    `${item.x},${item.y},${item.width},${item.height}`, reason));
  return fields;
}

function resolveSelection(model: ModelDto, viewId: string, ids: string[]): ResolvedTarget {
  const view = model.views.find((item) => item.id === viewId);
  if (!view) throw new EditorPropertiesInspectorError('EDITOR_INSPECTOR_SELECTION_UNAVAILABLE');
  if (ids.length === 0) return { status: 'empty', selectedIds: ids, reason: 'No selected item.' };
  if (ids.length > 1) return { status: 'multiple', selectedIds: ids,
    reason: 'Select one element or relationship to edit inspector fields.' };
  const itemId = ids[0];
  const node = findNode(view.nodes, itemId);
  if (node) return resolveNode(model, ids, node);
  const connection = view.connections.find((item) => item.id === itemId);
  if (connection) return resolveConnection(model, ids, connection);
  throw new EditorPropertiesInspectorError('EDITOR_INSPECTOR_SELECTION_UNAVAILABLE');
}

function resolveNode(model: ModelDto, ids: string[], node: ViewNodeDto): ResolvedTarget {
  const concept = node.elementId && model.elements.find((item) => item.id === node.elementId);
  if (!concept) return { status: 'unsupported', selectedIds: ids, item: node,
    reason: 'The selected view item does not reference an editable element concept.' };
  return { status: 'ready', selectedIds: ids, itemId: node.id, concept, kind: 'element', item: node };
}

function resolveConnection(model: ModelDto, ids: string[], connection: ViewConnectionDto): ResolvedTarget {
  const concept = connection.relationshipId &&
    model.relationships.find((item) => item.id === connection.relationshipId);
  if (!concept) return { status: 'unsupported', selectedIds: ids, item: connection,
    reason: 'The selected connection does not reference an editable relationship concept.' };
  return { status: 'ready', selectedIds: ids, itemId: connection.id,
    concept, kind: 'relationship', item: connection };
}

function inspectionOf(model: ModelDto, viewId: string, target: ResolvedTarget): EditorPropertiesInspection {
  if (target.status !== 'ready') return { viewId, selectedIds: target.selectedIds,
    status: target.status, fields: target.item ? readonlyViewFields(target.item) : [],
    ...(target.reason !== undefined ? { reason: target.reason } : {}) };
  const definitions = model.propertyDefinitions ?? [];
  const fields = [
    ...editableFields(target.concept, definitions),
    ...readonlyConceptFields(target.concept),
    ...readonlyViewFields(target.item)
  ];
  return { viewId, selectedIds: target.selectedIds, status: 'ready', fields,
    target: { kind: target.kind, itemId: target.itemId, conceptId: target.concept.id,
      type: target.concept.type } };
}

/** Headless profile-safe inspector over the DTO-owned editor command boundary. */
export class EditorPropertiesInspector {
  constructor(private readonly adapter: DiagramAdapter, private readonly viewId: string) {}

  inspect(selection?: readonly string[]): EditorPropertiesInspection {
    const model = this.adapter.getModel();
    const ids = selectedIds(this.adapter, this.viewId, selection);
    return inspectionOf(model, this.viewId, resolveSelection(model, this.viewId, ids));
  }

  setName(name: string | undefined, selection?: readonly string[]): void {
    this.executeForSelection({ type: 'concept-name', name }, selection);
  }

  setDocumentation(documentation: string | undefined, selection?: readonly string[]): void {
    this.executeForSelection({ type: 'concept-documentation', documentation }, selection);
  }

  setProperty(propertyDefinitionId: string, values: PropertyValueDto[],
    selection?: readonly string[]): void {
    this.executeForSelection({ type: 'property', propertyDefinitionId, values }, selection);
  }

  subscribe(listener: EditorPropertiesInspectorListener): () => void {
    listener(this.inspect());
    return this.adapter.subscribe((event) => {
      if (event.viewId === this.viewId) listener(this.inspect(event.selectedIds));
    });
  }

  private executeForSelection(command: InspectorEditCommand, selection?: readonly string[]): void {
    const inspection = this.inspect(selection);
    if (inspection.status !== 'ready' || !inspection.target) {
      throw new EditorPropertiesInspectorError('EDITOR_INSPECTOR_SELECTION_UNAVAILABLE');
    }
    const conceptId = inspection.target.conceptId;
    if (command.type === 'concept-name') {
      this.adapter.execute({ type: command.type, viewId: this.viewId, conceptId, name: command.name });
    } else if (command.type === 'concept-documentation') {
      this.adapter.execute({ type: command.type, viewId: this.viewId, conceptId,
        documentation: command.documentation });
    } else {
      this.adapter.execute({ type: command.type, viewId: this.viewId, conceptId,
        propertyDefinitionId: command.propertyDefinitionId, values: command.values });
    }
  }
}

export function createEditorPropertiesInspector(adapter: DiagramAdapter,
  viewId: string): EditorPropertiesInspector {
  return new EditorPropertiesInspector(adapter, viewId);
}
