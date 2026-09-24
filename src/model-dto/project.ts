import type {
  DtoDiagnostic, ElementDto, ModelDto, PointDto, RelationshipDto,
  StyleDto, ViewConnectionDto, ViewDto, ViewNodeDto
} from './types.js';
import { identifier, invalid, list, optionalText, record, validateModelDto } from './validate.js';

const omitted: DtoDiagnostic = {
  code: 'DTO_UNSUPPORTED_FIELDS', severity: 'warning', stage: 'projection',
  message: 'Imported data outside the supported DTO subset was omitted.'
};

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value === undefined || value === null ? undefined : record(value);
}

function optionalList(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : list(value);
}

function type(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:archimate:)?[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    return invalid();
  }
  return value;
}

function concept(value: unknown): ElementDto {
  const data = record(value);
  return { id: identifier(data.id), type: type(data.conceptType || data.type),
    name: optionalText(data.name), documentation: optionalText(data.documentation) };
}

function relationship(value: unknown): RelationshipDto {
  const data = record(value);
  const sourceId = data.sourceRefId || optionalRecord(data.source)?.id;
  const targetId = data.targetRefId || optionalRecord(data.target)?.id;
  return { ...concept(value), sourceId: identifier(sourceId), targetId: identifier(targetId) };
}

function color(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  const data = record(value);
  const rgb = ['r', 'g', 'b'].map((key) => Number(data[key]));
  if (rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return invalid();
  }
  const alpha = data.a === undefined ? 100 : Number(data.a);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 100) return invalid();
  const hex = rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('');
  return '#' + hex + (alpha === 100 ? '' : Math.round(alpha * 255 / 100).toString(16).padStart(2, '0'));
}

function style(value: unknown): StyleDto | undefined {
  const data = optionalRecord(value);
  if (!data) return undefined;
  return { fill: color(data.fillColor), stroke: color(data.lineColor),
    lineWidth: data.lineWidth === undefined ? undefined : Number(data.lineWidth) };
}

function supportedNode(value: unknown): boolean {
  const data = record(value);
  return data.$type === 'archimate:Node' && (
    data.meffType === 'Element' && Boolean(data.elementRef) ||
    ['Container', 'Label'].includes(String(data.meffType)) && !data.elementRef);
}

function supportedConnection(value: unknown): boolean {
  const data = record(value);
  return data.$type === 'archimate:Connection' && (
    data.meffType === 'Relationship' && Boolean(data.relationshipRef) ||
    data.meffType === 'Line' && !data.relationshipRef);
}

function node(value: unknown, depth = 0): ViewNodeDto {
  if (depth > 64) return invalid();
  const data = record(value);
  const kind = data.elementRef ? 'element' : data.meffType === 'Label' || data.type === 'archimate:Label' ?
    'label' : 'container';
  const semantic = optionalRecord(data.elementRef);
  return { id: identifier(data.id), kind, elementId: semantic ? identifier(semantic.id) : undefined,
    conceptRef: data.conceptRef === undefined ? undefined : identifier(data.conceptRef),
    xpathPart: optionalText(data.xpathPart),
    x: Number(data.x), y: Number(data.y), width: Number(data.w), height: Number(data.h),
    label: optionalText(data.label), style: style(data.style),
    nodes: optionalList(data.nodes).filter(supportedNode).map((child) => node(child, depth + 1)) };
}

function point(value: unknown): PointDto {
  const data = record(value);
  return { x: Number(data.x), y: Number(data.y),
    kind: data.kind as PointDto['kind'] };
}

function connection(value: unknown): ViewConnectionDto {
  const data = record(value);
  const relationshipRef = optionalRecord(data.relationshipRef);
  const waypoints = optionalRecord(data.waypointsNode)?.waypoints;
  return { id: identifier(data.id), kind: relationshipRef ? 'relationship' : 'line',
    relationshipId: relationshipRef ? identifier(relationshipRef.id) : undefined,
    sourceId: data.source === undefined ? undefined : identifier(record(data.source).id),
    targetId: data.target === undefined ? undefined : identifier(record(data.target).id),
    waypoints: optionalList(waypoints).map(point), label: optionalText(data.label), style: style(data.style) };
}

function view(value: unknown): ViewDto {
  const data = record(value);
  const items = optionalList(data.viewElements);
  const nodes = items.filter(supportedNode).map(node);
  const connections = items.filter(supportedConnection).map(connection);
  return { id: identifier(data.id), name: optionalText(data.name), nodes, connections };
}

function present(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 :
    value !== undefined && value !== null && (!value || typeof value !== 'object' ||
      Object.keys(value).length > 0);
}

function localizedLoss(data: Record<string, unknown>, field: string): boolean {
  const values = optionalList(data[field]);
  return values.length > 1 || values.some((value) => {
    const language = record(value).language;
    return language !== undefined && language !== null && language !== '';
  });
}

function unsupportedItem(value: unknown, depth = 0, diagram = true): boolean {
  if (depth > 64) return invalid();
  const data = record(value);
  const supported = supportedNode(value) || supportedConnection(value);
  return diagram && !supported || present(data.properties) || present(data.meffProperties) ||
    present(data.meffDocumentation) || present(data.viewRefs) || present(data.viewRef) ||
    present(data.resolvedViewRefs) || present(data.meffLabel) ||
    (diagram ? present(data.documentation) :
      present(data.propertiesNode) || present(data.propertyDefinitions) ||
      present(data.specialization) || present(data.children)) ||
    (diagram ? localizedLoss(data, 'localizedLabels') :
      localizedLoss(data, 'localizedNames') ||
      ['accessType', 'influenceStrength', 'isDirected', 'modifier'].some((key) => present(data[key]))) ||
    present(optionalRecord(data.style)?.font) ||
    optionalList(data.nodes).some((child) => unsupportedItem(child, depth + 1));
}

function hasUnsupported(model: Record<string, unknown>, rawViews: unknown[]): boolean {
  if (model.metadata || present(model.documentation) || present(model.version) ||
      localizedLoss(model, 'localizedNames') ||
      optionalList(model.propertyDefinitions).length ||
      optionalList(model.organizations).length || present(model.properties) ||
      present(optionalRecord(optionalRecord(model.views)?.viewpoints)?.viewpointsList)) return true;
  const elements = optionalList(optionalRecord(model.elementsNode)?.baseElements);
  const relationships = optionalList(optionalRecord(model.relationshipsNode)?.relationships);
  if ([...elements, ...relationships].some((item) => unsupportedItem(item, 0, false))) return true;
  return rawViews.some((value) => {
    const data = record(value);
    if (data.viewpoint || data.viewpointRef || localizedLoss(data, 'localizedNames') ||
        present(data.documentation) || present(data.properties) ||
        present(data.meffProperties) || present(data.meffDocumentation)) return true;
    return optionalList(data.viewElements).some((item) => unsupportedItem(item));
  });
}

/** Validate dynamic imported/moddle data before copying supported fields. */
export function projectImportedModelDto(input: unknown): ModelDto {
  const data = record(input);
  const model = record(data.rootElement || input);
  const elements = optionalList(optionalRecord(model.elementsNode)?.baseElements).map(concept);
  const relationships = optionalList(optionalRecord(model.relationshipsNode)?.relationships).map(relationship);
  const diagrams = optionalRecord(optionalRecord(model.views)?.diagrams);
  const rawViews = optionalList(diagrams?.viewsList);
  const views = rawViews.map(view);
  const diagnostics = optionalList(data.diagnostics).map((item) => {
    const entry = record(item);
    return { code: entry.code, severity: entry.severity, stage: entry.stage };
  });
  if (hasUnsupported(model, rawViews)) diagnostics.push(omitted);
  return validateModelDto({ schemaVersion: 1, id: model.id, name: model.name,
    elements, relationships, views, diagnostics });
}
