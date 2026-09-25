import type {
  ElementDto, ModelDto, PointDto, StyleDto, ViewConnectionDto, ViewDto, ViewNodeDto
} from './types.js';
import { invalid } from './validate.js';

function nonnegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

function color(value: string | undefined): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  const result: Record<string, number> = {
    r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16)
  };
  if (value.length === 9) {
    const byte = parseInt(value.slice(7, 9), 16);
    const percent = Math.round(byte * 100 / 255);
    if (percent === 100 || Math.round(percent * 255 / 100) !== byte) return invalid();
    result.a = percent;
  }
  return result;
}

function style(value: StyleDto | undefined): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return { fillColor: color(value.fill), lineColor: color(value.stroke), lineWidth: value.lineWidth };
}

function node(value: ViewNodeDto, elements: Map<string, ElementDto>,
  nodes: Map<string, { id: string }>): Record<string, unknown> {
  if (value.kind !== 'element' || value.conceptRef !== undefined ||
      value.xpathPart !== undefined) return invalid();
  const elementRef = elements.get(value.elementId!);
  if (!elementRef) return invalid();
  const result = { $type: 'archimate:Node', meffType: 'Element', id: value.id, elementRef,
    x: nonnegativeInteger(value.x), y: nonnegativeInteger(value.y),
    w: nonnegativeInteger(value.width), h: nonnegativeInteger(value.height),
    style: style(value.style), nodes: [] as Record<string, unknown>[] };
  nodes.set(value.id, result);
  result.nodes = value.nodes.map((child) => node(child, elements, nodes));
  return result;
}

function path(values: PointDto[]): PointDto[] {
  return values.map((value, index) => {
    const kind = index === 0 ? 'sourceAttachment' : index === values.length - 1 ?
      'targetAttachment' : 'bendpoint';
    if (value.kind !== kind) return invalid();
    return { kind, x: nonnegativeInteger(value.x), y: nonnegativeInteger(value.y) };
  });
}

function connection(value: ViewConnectionDto, nodes: Map<string, { id: string }>,
  relationships: Map<string, { id: string }>): Record<string, unknown> {
  if (value.kind !== 'relationship') return invalid();
  const relationshipRef = relationships.get(value.relationshipId!);
  const source = nodes.get(value.sourceId!);
  const target = nodes.get(value.targetId!);
  if (!relationshipRef || !source || !target) return invalid();
  return { $type: 'archimate:Connection', meffType: 'Relationship', id: value.id,
    relationshipRef, source, target, style: style(value.style),
    waypointsNode: { waypoints: path(value.waypoints) } };
}

function view(value: ViewDto, elements: Map<string, ElementDto>,
  relationships: Map<string, { id: string }>): Record<string, unknown> {
  const nodes = new Map<string, { id: string }>();
  const viewElements = value.nodes.map((item) => node(item, elements, nodes));
  viewElements.push(...value.connections.map((item) => connection(item, nodes, relationships)));
  return { id: value.id, name: value.name, meffType: 'Diagram', viewElements };
}

function properties(value: ElementDto['properties']): Record<string, unknown>[] | undefined {
  return value?.map((item) => ({ propertyDefinitionRef: item.propertyDefinitionId,
    values: item.values }));
}

/** Build only records the existing MEFF serializer can emit without omission. */
export function toMeffShape(dto: ModelDto): Record<string, unknown> {
  const elements = new Map(dto.elements.map((item) => [item.id, item]));
  const relationships = new Map(dto.relationships.map((item) => [item.id, item]));
  for (const item of dto.relationships) {
    if (!elements.has(item.sourceId) || !elements.has(item.targetId)) return invalid();
  }
  return { id: dto.id, name: dto.name,
    propertyDefinitionsNode: dto.propertyDefinitions ? { propertyDefinitions: dto.propertyDefinitions } : undefined,
    elementsNode: { baseElements: dto.elements.map((item) => ({ ...item, properties: properties(item.properties) })) },
    relationshipsNode: { relationships: dto.relationships.map((item) => ({ ...item,
      properties: properties(item.properties),
      sourceRefId: item.sourceId, targetRefId: item.targetId })) },
    views: { diagrams: { viewsList: dto.views.map((item) => view(item, elements, relationships)) } } };
}
