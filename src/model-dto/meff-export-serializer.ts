/** Deterministic serializer for the public MEFF 3.1 Model/Diagram subset. */

import { serializeConceptProperties, serializePropertyDefinitions } from './meff-properties.js';

const NS = 'http://www.opengroup.org/xsd/archimate/3.0/';
const XML_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const QNAME = /^(?:archimate:)?[A-Za-z][A-Za-z0-9]*$/;
const ELEMENT_TYPES = new Set([
  'Assessment', 'Constraint', 'Driver', 'Goal', 'Meaning', 'Outcome', 'Principle',
  'Requirement', 'Stakeholder', 'Value', 'Capability', 'ValueStream',
  'CourseOfAction', 'Resource', 'BusinessActor', 'BusinessCollaboration',
  'BusinessEvent', 'BusinessFunction', 'BusinessInteraction', 'BusinessInterface',
  'BusinessObject', 'BusinessProcess', 'BusinessRole', 'BusinessService',
  'Contract', 'Product', 'Representation', 'ApplicationCollaboration',
  'ApplicationComponent', 'ApplicationEvent', 'ApplicationFunction',
  'ApplicationInteraction', 'ApplicationInterface', 'ApplicationProcess',
  'ApplicationService', 'DataObject', 'Artifact', 'CommunicationNetwork',
  'Device', 'Node', 'Path', 'SystemSoftware', 'TechnologyCollaboration',
  'TechnologyEvent', 'TechnologyFunction', 'TechnologyInteraction',
  'TechnologyInterface', 'TechnologyProcess', 'TechnologyService',
  'DistributionNetwork', 'Equipment', 'Facility', 'Material', 'Deliverable',
  'ImplementationEvent', 'WorkPackage', 'Gap', 'Plateau', 'Location', 'Grouping'
]);
const RELATIONSHIP_TYPES = new Set([
  'Composition', 'Aggregation', 'Assignment', 'Realization', 'Association',
  'Influence', 'Access', 'Serving', 'Triggering', 'Flow', 'Specialization'
]);

type Data = Record<string, unknown>;
type WarningCode = 'MEFF_EXPORT_MODEL_OMITTED' | 'MEFF_EXPORT_VIEW_OMITTED' |
  'MEFF_EXPORT_DIAGRAM_OMITTED' | 'MEFF_EXPORT_ELEMENT_OMITTED' |
  'MEFF_EXPORT_RELATIONSHIP_OMITTED';
type ExportResult = {
  xml: string;
  diagnostics: Array<{ code: WarningCode; severity: 'warning'; stage: 'export'; message: string }>;
};

function failure(): never {
  const error = new Error('The model cannot be serialized as the supported MEFF subset.') as Error & { code: string };
  error.code = 'MEFF_EXPORT_INVALID';
  throw error;
}

function data(value: unknown): Data | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Data : undefined;
}

function field(record: Data | undefined, name: string): unknown {
  return record?.[name];
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function escape(value: unknown): string {
  if (typeof value !== 'string') return failure();
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        (code >= 0xD800 && code <= 0xDFFF) || code === 0xFFFE || code === 0xFFFF) return failure();
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function id(value: unknown, ids: Set<string>): string {
  if (typeof value !== 'string' || !XML_ID.test(value) || ids.has(value)) return failure();
  ids.add(value);
  return escape(value);
}

function type(value: unknown, vocabulary: Set<string>): string {
  if (typeof value !== 'string' || !QNAME.test(value)) return failure();
  const local = value.split(':').pop()!;
  if (!vocabulary.has(local)) return failure();
  return 'archimate:' + local;
}

function diagnostic(code: WarningCode): ExportResult['diagnostics'][number] {
  const descriptions: Record<WarningCode, string> = {
    MEFF_EXPORT_MODEL_OMITTED: 'Unsupported model metadata, model properties, or organizations were omitted.',
    MEFF_EXPORT_VIEW_OMITTED: 'Unsupported view or viewpoint data was omitted.',
    MEFF_EXPORT_DIAGRAM_OMITTED: 'Unsupported diagram presentation data was omitted.',
    MEFF_EXPORT_ELEMENT_OMITTED: 'An unsupported model element or field was omitted.',
    MEFF_EXPORT_RELATIONSHIP_OMITTED: 'An unsupported relationship or field was omitted.'
  };
  return { code, severity: 'warning', stage: 'export', message: descriptions[code] };
}

function hasContent(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value !== 'object') return true;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((item) => hasContent(item, seen));
}

function attrs(record: Data | undefined, names: string[]): boolean {
  return names.some((name) => hasContent(field(record, name)));
}

function names(record: Data | undefined, required = false): string {
  const localized = list(field(record, 'localizedNames'));
  const hasName = field(record, 'name') !== undefined && field(record, 'name') !== null;
  const raw = localized.length ? localized : hasName
    ? [{ value: field(record, 'name') }] : [];
  if (required && !raw.length) return failure();
  return raw.map((entry) => {
    const item = data(entry);
    const value = field(item, 'value');
    if (typeof value !== 'string') return failure();
    const language = field(item, 'language');
    const lang = language ? ' xml:lang="' + escape(language) + '"' : '';
    return '<name' + lang + '>' + escape(value) + '</name>';
  }).join('');
}

function documentation(record: Data | undefined): string {
  const value = field(record, 'documentation');
  return value === undefined || value === null ? '' :
    '<documentation>' + escape(value) + '</documentation>';
}

function number(value: unknown, positive = false, integer = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (positive ? 1 : 0) ||
      (integer && !Number.isInteger(value))) return failure();
  return String(value);
}

function color(value: unknown, tag: string): string {
  if (!value) return '';
  const item = data(value);
  if (!item) return failure();
  const fields = ['r', 'g', 'b', 'a'].filter((name) => field(item, name) !== undefined);
  if (!['r', 'g', 'b'].every((name) => fields.includes(name))) return failure();
  return '<' + tag + fields.map((name) => {
    const component = field(item, name);
    if (typeof component !== 'number' || component > (name === 'a' ? 100 : 255)) return failure();
    return ' ' + name + '="' + number(component, false, true) + '"';
  }).join('') + '/>';
}

function style(record: Data | undefined): string {
  const raw = field(record, 'style');
  if (raw === undefined) return '';
  const value = data(raw) || {};
  const rawWidth = field(value, 'lineWidth');
  const width = rawWidth === undefined ? '' : ' lineWidth="' + number(rawWidth) + '"';
  let children = color(field(value, 'lineColor'), 'lineColor') + color(field(value, 'fillColor'), 'fillColor');
  const font = data(field(value, 'font'));
  if (font) {
    let attributes = '';
    if (field(font, 'name') !== undefined) attributes += ' name="' + escape(field(font, 'name')) + '"';
    if (field(font, 'size') !== undefined) attributes += ' size="' + number(field(font, 'size'), true) + '"';
    if (field(font, 'style') !== undefined) attributes += ' style="' + escape(field(font, 'style')) + '"';
    children += '<font' + attributes + '>' + color(field(font, 'color'), 'color') + '</font>';
  }
  return '<style' + width + '>' + children + '</style>';
}

function geometry(record: Data): string {
  const raw = ['x', 'y', 'w', 'h'].every((name) => field(record, name) !== undefined)
    ? record : data(field(record, 'meffGeometry')) || record;
  const space = field(raw, 'coordinateSpace');
  if (space && space !== 'diagram') return failure();
  return ['x', 'y', 'w', 'h'].map((name) =>
    ' ' + name + '="' + number(field(raw, name), name === 'w' || name === 'h', true) + '"').join('');
}

function point(record: unknown, tag: string): string {
  if (!record) return '';
  const value = data(record);
  if (!value) return failure();
  const space = field(value, 'coordinateSpace');
  if (space && space !== 'diagram') return failure();
  return '<' + tag + ' x="' + number(field(value, 'x'), false, true) +
    '" y="' + number(field(value, 'y'), false, true) + '"/>';
}

function currentPathMatchesGeometry(connection: Data): boolean {
  const waypoints = data(field(connection, 'waypointsNode'));
  const current = field(waypoints, 'waypoints');
  if (!current) return true;
  const geometry = data(field(connection, 'meffGeometry'));
  if (!geometry) return list(current).length === 0;
  const original = [field(geometry, 'sourceAttachment'), ...list(field(geometry, 'bendpoints')),
    field(geometry, 'targetAttachment')].filter(Boolean).map(data);
  const points = list(current).map(data);
  return original.length === points.length && original.every((point, index) =>
    !!point && !!points[index] && field(point, 'x') === field(points[index], 'x') &&
    field(point, 'y') === field(points[index], 'y') && field(point, 'kind') === field(points[index], 'kind'));
}

function connectionPath(connection: Data, warn: (code: WarningCode) => void): Data {
  const geometry = data(field(connection, 'meffGeometry'));
  if (currentPathMatchesGeometry(connection)) return geometry || {};
  const waypoints = data(field(connection, 'waypointsNode'));
  const current = list(field(waypoints, 'waypoints')).map(data);
  if (current.length >= 2 && current.every((item) => {
    const x = field(item, 'x');
    const y = field(item, 'y');
    return Number.isInteger(x) && typeof x === 'number' && x >= 0 &&
      Number.isInteger(y) && typeof y === 'number' && y >= 0;
  })) {
    return { sourceAttachment: current[0], bendpoints: current.slice(1, -1), targetAttachment: current[current.length - 1] };
  }
  warn('MEFF_EXPORT_DIAGRAM_OMITTED');
  return {};
}

/** Serialize a validated model shape while keeping dynamic parser values unknown. */
export function exportMeff(model: unknown): ExportResult {
  const root = data(model);
  if (!root || !field(root, 'id')) return failure();
  const ids = new Set<string>();
  const omitted = new Set<WarningCode>();
  const warn = (code: WarningCode): void => { omitted.add(code); };
  const modelId = id(field(root, 'id'), ids);
  if (attrs(root, ['metadata', 'organizations', 'organizationsNode', 'properties',
    'propertiesNode', 'version'])) warn('MEFF_EXPORT_MODEL_OMITTED');
  const propertyDefinitions = field(data(field(root, 'propertyDefinitionsNode')), 'propertyDefinitions');
  const definitionIds = new Set(list(propertyDefinitions).map(data).map((item) => field(item, 'id'))
    .filter((value): value is string => typeof value === 'string'));
  let body = names(root, true) + documentation(root);
  const elementsNode = data(field(root, 'elementsNode'));
  const elements = list(field(elementsNode, 'baseElements')).map(data);
  const elementIds = new Set<string>();
  if (elements.length) {
    body += '<elements>' + elements.map((element) => {
      const elementId = field(element, 'id');
      const elementType = field(element, 'conceptType') || field(element, 'type');
      if (!element || !elementId || !elementType) { warn('MEFF_EXPORT_ELEMENT_OMITTED'); return ''; }
      if (typeof elementId !== 'string') return failure();
      const escapedId = id(elementId, ids);
      elementIds.add(elementId);
      if (attrs(element, ['propertiesNode', 'propertyDefinitions', 'specialization', 'children'])) {
        warn('MEFF_EXPORT_ELEMENT_OMITTED');
      }
      return '<element identifier="' + escapedId + '" xsi:type="' + type(elementType, ELEMENT_TYPES) + '">' +
        names(element) + documentation(element) +
        serializeConceptProperties(field(element, 'properties'), definitionIds, escape) + '</element>';
    }).join('') + '</elements>';
  }
  body += exportRelationships(root, ids, omitted, elementIds, definitionIds);
  body += serializePropertyDefinitions(propertyDefinitions, (value) => id(value, ids), escape);
  body += exportViews(root, ids, omitted, elementIds, relationshipIds(root));
  return {
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model xmlns="' + NS + '" xmlns:archimate="' + NS +
      '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="' +
      modelId + '">' + body + '</model>\n',
    diagnostics: Array.from(omitted).sort().map((code) => diagnostic(code))
  };
}

function relationshipIds(root: Data): Set<string> {
  const node = data(field(root, 'relationshipsNode'));
  return new Set(list(field(node, 'relationships')).map(data)
    .map((item) => field(item, 'id')).filter((value): value is string => typeof value === 'string'));
}

function exportRelationships(root: Data, ids: Set<string>, omitted: Set<WarningCode>,
  elementIds: Set<string>, definitionIds: Set<string>): string {
  const node = data(field(root, 'relationshipsNode'));
  const relations = list(field(node, 'relationships')).map(data);
  if (!relations.length) return '';
  const body = relations.map((relation) => {
    const relationId = field(relation, 'id');
    const relationType = field(relation, 'conceptType') || field(relation, 'type');
    if (!relation || !relationId || !relationType) { omitted.add('MEFF_EXPORT_RELATIONSHIP_OMITTED'); return ''; }
    const sourceRecord = data(field(relation, 'source'));
    const targetRecord = data(field(relation, 'target'));
    const source = field(relation, 'sourceRefId') || field(sourceRecord, 'id');
    const target = field(relation, 'targetRefId') || field(targetRecord, 'id');
    if (typeof source !== 'string' || typeof target !== 'string' || !elementIds.has(source) || !elementIds.has(target)) return failure();
    const escapedId = id(relationId, ids);
    if (attrs(relation, ['propertiesNode', 'accessType', 'influenceStrength', 'isDirected', 'modifier'])) {
      omitted.add('MEFF_EXPORT_RELATIONSHIP_OMITTED');
    }
    return '<relationship identifier="' + escapedId + '" xsi:type="' + type(relationType, RELATIONSHIP_TYPES) +
      '" source="' + escape(source) + '" target="' + escape(target) + '">' + names(relation) +
      documentation(relation) +
      serializeConceptProperties(field(relation, 'properties'), definitionIds, escape) + '</relationship>';
  }).join('');
  return '<relationships>' + body + '</relationships>';
}

function exportViews(root: Data, ids: Set<string>, omitted: Set<WarningCode>,
  elementIds: Set<string>, relationshipIds: Set<string>): string {
  const viewsRoot = data(field(root, 'views'));
  const diagrams = data(field(viewsRoot, 'diagrams'));
  const views = list(field(diagrams, 'viewsList')).map(data);
  if (attrs(viewsRoot, ['viewpoints', 'viewpointDefinitions'])) omitted.add('MEFF_EXPORT_VIEW_OMITTED');
  if (!views.length) return '';
  const body = views.map((view) => serializeView(view, ids, omitted, elementIds, relationshipIds)).join('');
  return '<views><diagrams>' + body + '</diagrams></views>';
}

function serializeView(view: Data | undefined, ids: Set<string>, omitted: Set<WarningCode>,
  elementIds: Set<string>, relationshipIds: Set<string>): string {
  const viewId = field(view, 'id');
  const viewType = field(view, 'meffType');
  if (!view || !viewId || (viewType && viewType !== 'Diagram')) {
    omitted.add('MEFF_EXPORT_VIEW_OMITTED'); return '';
  }
  const escapedId = id(viewId, ids);
  if (attrs(view, ['viewpoint', 'viewpointRef', 'resolvedViewpointRef', 'documentation',
    'properties', 'meffDocumentation', 'meffProperties'])) omitted.add('MEFF_EXPORT_VIEW_OMITTED');
  const nodes: Data[] = [];
  const connections: Data[] = [];
  for (const raw of list(field(view, 'viewElements'))) {
    const item = data(raw);
    if (field(item, 'relationshipRef') || field(item, '$type') === 'archimate:Connection') {
      if (item) connections.push(item);
    } else if (item) nodes.push(item);
  }
  const nodeIds = new Set<string>();
  const viewBody = names(view) + nodes.map((item) => serializeNode(item, ids, omitted, elementIds, nodeIds)).join('') +
    connections.map((item) => serializeConnection(item, ids, omitted, relationshipIds, nodeIds)).join('');
  return '<view identifier="' + escapedId + '" xsi:type="archimate:Diagram">' + viewBody + '</view>';
}

function serializeNode(item: Data, ids: Set<string>, omitted: Set<WarningCode>,
  elementIds: Set<string>, nodeIds: Set<string>): string {
  const meffType = field(item, 'meffType');
  const elementRef = data(field(item, 'elementRef'));
  const elementId = field(elementRef, 'id');
  if ((meffType && meffType !== 'Element') || !elementId || typeof elementId !== 'string' || !elementIds.has(elementId)) {
    omitted.add('MEFF_EXPORT_DIAGRAM_OMITTED'); return '';
  }
  const nodeId = field(item, 'id');
  const escapedId = id(nodeId, ids);
  if (typeof nodeId === 'string') nodeIds.add(nodeId);
  if (attrs(item, ['meffLabel', 'localizedLabels', 'meffDocumentation', 'meffProperties',
    'viewRef', 'viewRefs', 'label', 'documentation'])) omitted.add('MEFF_EXPORT_DIAGRAM_OMITTED');
  const children = list(field(item, 'nodes')).map(data)
    .map((child) => child ? serializeNode(child, ids, omitted, elementIds, nodeIds) : '');
  return '<node identifier="' + escapedId + '" xsi:type="archimate:Element" elementRef="' +
    escape(elementId) + '"' + geometry(item) + '>' + style(item) + children.join('') + '</node>';
}

function serializeConnection(item: Data, ids: Set<string>, omitted: Set<WarningCode>,
  relationshipIds: Set<string>, nodeIds: Set<string>): string {
  const meffType = field(item, 'meffType');
  const relationshipRef = data(field(item, 'relationshipRef'));
  const relationshipId = field(relationshipRef, 'id');
  const source = data(field(item, 'source'));
  const target = data(field(item, 'target'));
  const sourceId = field(source, 'id');
  const targetId = field(target, 'id');
  if ((meffType && meffType !== 'Relationship') || typeof relationshipId !== 'string' ||
      !relationshipIds.has(relationshipId) || typeof sourceId !== 'string' || !nodeIds.has(sourceId) ||
      typeof targetId !== 'string' || !nodeIds.has(targetId)) {
    omitted.add('MEFF_EXPORT_DIAGRAM_OMITTED'); return '';
  }
  if (attrs(item, ['meffLabel', 'localizedLabels', 'meffDocumentation', 'meffProperties',
    'viewRef', 'viewRefs', 'resolvedViewRefs', 'label', 'documentation'])) omitted.add('MEFF_EXPORT_DIAGRAM_OMITTED');
  const path = connectionPath(item, (code) => omitted.add(code));
  const bends = list(field(path, 'bendpoints')).map((bend) => point(bend, 'bendpoint')).join('');
  return '<connection identifier="' + id(field(item, 'id'), ids) +
    '" xsi:type="archimate:Relationship" relationshipRef="' + escape(relationshipId) +
    '" source="' + escape(sourceId) + '" target="' + escape(targetId) + '">' + style(item) +
    point(field(path, 'sourceAttachment'), 'sourceAttachment') + bends +
    point(field(path, 'targetAttachment'), 'targetAttachment') + '</connection>';
}
