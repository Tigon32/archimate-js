import type {
  ConceptPropertyDto, DtoDiagnostic, ElementDto, ModelDto, PointDto, PropertyDefinitionDto,
  PropertyValueDto, RelationshipDto,
  StyleDto, ViewConnectionDto, ViewDto, ViewNodeDto
} from './types.js';

const ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const TYPE = /^(?:archimate:)?[A-Za-z][A-Za-z0-9]*$/;
const HEX = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const KINDS = new Set(['sourceAttachment', 'bendpoint', 'targetAttachment']);

export function invalid(): never {
  const error = new TypeError('The model DTO is invalid.');
  Object.assign(error, { code: 'MODEL_DTO_INVALID' });
  throw error;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) invalid();
  return value;
}

export function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 65536) invalid();
  return value;
}

function geometry(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || positive && value <= 0) invalid();
  return value;
}

export function style(value: unknown): StyleDto | undefined {
  if (value === undefined) return undefined;
  const data = record(value);
  const result: StyleDto = {};
  for (const key of ['fill', 'stroke'] as const) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== 'string' || !HEX.test(data[key])) invalid();
      result[key] = data[key].toUpperCase();
    }
  }
  if (data.lineWidth !== undefined) result.lineWidth = geometry(data.lineWidth, true);
  return result;
}

function point(value: unknown): PointDto {
  const data = record(value);
  const result: PointDto = { x: geometry(data.x), y: geometry(data.y) };
  if (data.kind !== undefined) {
    if (typeof data.kind !== 'string' || !KINDS.has(data.kind)) invalid();
    result.kind = data.kind as PointDto['kind'];
  }
  return result;
}

function element(value: unknown): ElementDto {
  const data = record(value);
  if (typeof data.type !== 'string' || !TYPE.test(data.type)) invalid();
  const properties = data.properties === undefined ? undefined : list(data.properties).map(property);
  if (properties?.length === 0) invalid();
  return { id: identifier(data.id), type: data.type,
    name: optionalText(data.name), documentation: optionalText(data.documentation),
    ...(properties ? { properties } : {}) };
}

function propertyDefinition(value: unknown): PropertyDefinitionDto {
  const data = record(value);
  const types = ['string', 'boolean', 'integer', 'real'];
  if (typeof data.type !== 'string' || !types.includes(data.type)) invalid();
  return { id: identifier(data.id), type: data.type as PropertyDefinitionDto['type'],
    name: optionalText(data.name), documentation: optionalText(data.documentation) };
}

function propertyValue(value: unknown): PropertyValueDto {
  const data = record(value);
  const language = optionalText(data.language);
  const text = optionalText(data.value);
  if (text === undefined || language === '') invalid();
  return { language, value: text };
}

function property(value: unknown): ConceptPropertyDto {
  const data = record(value);
  const values = list(data.values).map(propertyValue);
  if (!values.length) invalid();
  return { propertyDefinitionId: identifier(data.propertyDefinitionId), values };
}

function relationship(value: unknown): RelationshipDto {
  const data = record(value);
  return { ...element(value), sourceId: identifier(data.sourceId), targetId: identifier(data.targetId) };
}

function node(value: unknown, ids: Set<string>, depth = 0): ViewNodeDto {
  if (depth > 64) invalid();
  const data = record(value);
  const id = identifier(data.id);
  if (!['element', 'container', 'label'].includes(String(data.kind))) invalid();
  const kind = data.kind as ViewNodeDto['kind'];
  if (kind === 'element' && data.elementId === undefined ||
      kind !== 'element' && data.elementId !== undefined) invalid();
  if (ids.has(id)) invalid();
  ids.add(id);
  return { id, kind, elementId: kind === 'element' ? identifier(data.elementId) : undefined,
    conceptRef: data.conceptRef === undefined ? undefined : identifier(data.conceptRef),
    xpathPart: optionalText(data.xpathPart), x: geometry(data.x), y: geometry(data.y),
    width: geometry(data.width, true), height: geometry(data.height, true),
    label: optionalText(data.label), style: style(data.style),
    nodes: list(data.nodes).map((child) => node(child, ids, depth + 1)) };
}

function connection(value: unknown, nodeIds: Set<string>): ViewConnectionDto {
  const data = record(value);
  if (!['relationship', 'line'].includes(String(data.kind))) invalid();
  const kind = data.kind as ViewConnectionDto['kind'];
  if (kind === 'relationship' && (data.relationshipId === undefined ||
      data.sourceId === undefined || data.targetId === undefined) ||
      kind === 'line' && data.relationshipId !== undefined) invalid();
  const sourceId = data.sourceId === undefined ? undefined : identifier(data.sourceId);
  const targetId = data.targetId === undefined ? undefined : identifier(data.targetId);
  if (sourceId && !nodeIds.has(sourceId) || targetId && !nodeIds.has(targetId)) invalid();
  const waypoints = list(data.waypoints).map(point);
  if (waypoints.length < 2) invalid();
  return { id: identifier(data.id), kind, relationshipId: kind === 'relationship' ?
    identifier(data.relationshipId) : undefined, sourceId, targetId, waypoints,
    label: optionalText(data.label), style: style(data.style) };
}

function view(value: unknown, elementIds: Set<string>, relationships: Map<string, RelationshipDto>): ViewDto {
  const data = record(value);
  const nodeIds = new Set<string>();
  const concepts = new Map<string, string>();
  const nodes = list(data.nodes).map((item) => node(item, nodeIds));
  const visit = (item: ViewNodeDto): void => {
    if (item.kind === 'element' && !elementIds.has(item.elementId!)) invalid();
    if (item.elementId) concepts.set(item.id, item.elementId);
    item.nodes.forEach(visit);
  };
  nodes.forEach(visit);
  const connections = list(data.connections).map((item) => connection(item, nodeIds));
  const ids = new Set(nodeIds);
  for (const item of connections) {
    if (ids.has(item.id)) invalid();
    if (item.kind === 'relationship') {
      const relationship = relationships.get(item.relationshipId!);
      if (!relationship || concepts.get(item.sourceId!) !== relationship.sourceId ||
          concepts.get(item.targetId!) !== relationship.targetId) invalid();
    }
    ids.add(item.id);
  }
  return { id: identifier(data.id), name: optionalText(data.name), nodes, connections };
}

function diagnostic(value: unknown): DtoDiagnostic {
  const data = record(value);
  if (typeof data.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,80}$/.test(data.code) ||
      !['warning', 'error'].includes(String(data.severity)) ||
      !['parse', 'projection', 'validation'].includes(String(data.stage))) invalid();
  return { code: data.code, severity: data.severity as DtoDiagnostic['severity'],
    stage: data.stage as DtoDiagnostic['stage'],
    message: 'Imported data outside the supported DTO subset was omitted.' };
}

function unique(ids: string[]): Set<string> {
  if (ids.length !== new Set(ids).size) invalid();
  return new Set(ids);
}

export function validateModelDto(input: unknown): ModelDto {
  const data = record(input);
  if (data.schemaVersion !== 1) invalid();
  const propertyDefinitions = data.propertyDefinitions === undefined ? undefined :
    list(data.propertyDefinitions).map(propertyDefinition);
  const definitionIds = unique((propertyDefinitions || []).map((item) => item.id));
  if (propertyDefinitions && propertyDefinitions.length === 0) invalid();
  const elements = list(data.elements).map(element);
  const relationships = list(data.relationships).map(relationship);
  for (const concept of [...elements, ...relationships]) {
    if (concept.properties?.some((item) => !definitionIds.has(item.propertyDefinitionId))) invalid();
  }
  const elementIds = unique(elements.map((item) => item.id));
  const relationshipIds = unique(relationships.map((item) => item.id));
  const conceptIds = new Set([...elementIds, ...relationshipIds]);
  if (elements.some((item) => relationshipIds.has(item.id)) || relationships.some((item) =>
    !conceptIds.has(item.sourceId) || !conceptIds.has(item.targetId))) invalid();
  const relationshipMap = new Map(relationships.map((item) => [item.id, item]));
  const views = list(data.views).map((item) => view(item, elementIds, relationshipMap));
  unique(views.map((item) => item.id));
  const diagnostics = list(data.diagnostics).map(diagnostic);
  return { schemaVersion: 1, id: identifier(data.id), name: optionalText(data.name),
    ...(propertyDefinitions ? { propertyDefinitions } : {}),
    elements, relationships, views, diagnostics };
}

export function serializeModelDto(input: unknown): string {
  return JSON.stringify(validateModelDto(input));
}

export function parseModelDto(json: unknown): ModelDto {
  if (typeof json !== 'string' || json.length > 10_000_000) invalid();
  try { return validateModelDto(JSON.parse(json)); }
  catch { return invalid(); }
}
