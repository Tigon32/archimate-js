import { SaxesParser } from 'saxes';

import {
  RELATIONSHIP_SEMANTICS_VERSION,
  parseSemanticProfile,
  validateRelationshipSemantics
} from './relationship-semantics.js';

import type {
  Diagnostic,
  DiagnosticLayer,
  ModelSummary,
  OrganizationRule,
  RepairSuggestion,
  ValidationResult,
  ValidatorOptions
} from './types';

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  line: number;
  column: number;
};

const DEFAULT_LIMITS = {
  maxXmlBytes: 1_048_576,
  maxDepth: 64,
  maxNodes: 25_000
};

/** Semantic profile target; exchange-format namespace and language version are distinct. */
export const ARCHIMATE_LANGUAGE_VERSION = RELATIONSHIP_SEMANTICS_VERSION;

const knownRelationships = new Set([
  'AccessRelationship', 'AggregationRelationship', 'AssignmentRelationship',
  'AssociationRelationship', 'CompositionRelationship', 'FlowRelationship',
  'InfluenceRelationship', 'RealizationRelationship', 'ServingRelationship',
  'SpecializationRelationship', 'TriggeringRelationship'
]);

const junctionTypes = new Set(['Junction', 'AndJunction', 'OrJunction']);

const knownElements = new Set([
  'Assessment', 'Constraint', 'Driver', 'Goal', 'Meaning', 'Outcome', 'Principle', 'Requirement', 'Stakeholder', 'Value',
  'Capability', 'ValueStream', 'CourseOfAction', 'Resource',
  'BusinessActor', 'BusinessCollaboration', 'BusinessEvent', 'BusinessFunction', 'BusinessInteraction', 'BusinessInterface',
  'BusinessObject', 'BusinessProcess', 'BusinessRole', 'BusinessService', 'Contract', 'Product', 'Representation',
  'ApplicationCollaboration', 'ApplicationComponent', 'ApplicationEvent', 'ApplicationFunction', 'ApplicationInteraction',
  'ApplicationInterface', 'ApplicationProcess', 'ApplicationService', 'DataObject',
  'Artifact', 'CommunicationNetwork', 'Device', 'Node', 'Path', 'SystemSoftware', 'TechnologyCollaboration',
  'TechnologyEvent', 'TechnologyFunction', 'TechnologyInteraction', 'TechnologyInterface', 'TechnologyProcess', 'TechnologyService',
  'DistributionNetwork', 'Equipment', 'Facility', 'Material', 'Deliverable', 'ImplementationEvent', 'WorkPackage', 'Gap', 'Plateau',
  'Location', 'Grouping', 'Junction', 'AndJunction', 'OrJunction'
]);

const sortDiagnostics = (items: Diagnostic[]): Diagnostic[] => items.sort((a, b) =>
  a.layer.localeCompare(b.layer) || a.code.localeCompare(b.code) ||
  (a.subjectId ?? '').localeCompare(b.subjectId ?? '') ||
  (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)
);

function localName(value: string): string {
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

function attribute(node: XmlNode, name: string): string | undefined {
  if (node.attributes[name] !== undefined) return node.attributes[name];
  return Object.entries(node.attributes).find(([key]) => localName(key) === name)?.[1];
}

function typeName(node: XmlNode): string {
  return localName(attribute(node, 'type') ?? node.name);
}

function pushDiagnostic(
  diagnostics: Diagnostic[],
  code: string,
  severity: Diagnostic['severity'],
  layer: DiagnosticLayer,
  message: string,
  node?: XmlNode,
  subjectId?: string
): void {
  diagnostics.push({
    code,
    severity,
    layer,
    message,
    ...(node ? { line: node.line, column: node.column } : {}),
    ...(subjectId ? { subjectId } : {})
  });
}

function parseXml(xml: string, options: Required<Pick<ValidatorOptions, 'maxDepth' | 'maxNodes'>>): {
  root?: XmlNode;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let nodeCount = 0;
  let blocked = false;
  const parser = new SaxesParser({ xmlns: false, fragment: false });

  parser.on('doctype', () => {
    blocked = true;
    pushDiagnostic(diagnostics, 'XML_DTD_FORBIDDEN', 'error', 'xml', 'DOCTYPE declarations are not accepted.');
    throw new Error('XML_DTD_FORBIDDEN');
  });
  parser.on('opentag', (tag) => {
    if (blocked) return;
    nodeCount += 1;
    if (nodeCount > options.maxNodes) {
      blocked = true;
      pushDiagnostic(diagnostics, 'XML_NODE_LIMIT', 'error', 'xml', 'XML node limit exceeded.');
      throw new Error('XML_NODE_LIMIT');
    }
    if (stack.length >= options.maxDepth) {
      blocked = true;
      pushDiagnostic(diagnostics, 'XML_DEPTH_LIMIT', 'error', 'xml', 'XML nesting limit exceeded.');
      throw new Error('XML_DEPTH_LIMIT');
    }
    if (Object.keys(tag.attributes).length > 64) {
      blocked = true;
      pushDiagnostic(diagnostics, 'XML_ATTRIBUTE_LIMIT', 'error', 'xml', 'XML attribute limit exceeded.');
      throw new Error('XML_ATTRIBUTE_LIMIT');
    }
    const node: XmlNode = {
      name: tag.name,
      attributes: Object.fromEntries(Object.entries(tag.attributes).map(([key, value]) => [key, String(value)])),
      children: [],
      line: parser.line + 1,
      column: parser.column + 1
    };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root) {
      blocked = true;
      pushDiagnostic(diagnostics, 'XML_MULTIPLE_ROOTS', 'error', 'xml', 'XML must contain exactly one root element.', node);
      throw new Error('XML_MULTIPLE_ROOTS');
    } else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => { stack.pop(); });
  parser.on('error', () => {
    if (!blocked) pushDiagnostic(diagnostics, 'XML_MALFORMED', 'error', 'xml', 'XML is malformed or contains unsupported syntax.');
  });

  try {
    parser.write(xml).close();
  } catch {
    if (!blocked && diagnostics.length === 0) {
      pushDiagnostic(diagnostics, 'XML_MALFORMED', 'error', 'xml', 'XML is malformed or contains unsupported syntax.');
    }
  }
  if (!root && diagnostics.length === 0) {
    pushDiagnostic(diagnostics, 'XML_EMPTY', 'error', 'xml', 'XML contains no root element.');
  }
  return { root, diagnostics };
}

function descendants(root: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = [];
  const todo = [root];
  while (todo.length) {
    const current = todo.pop()!;
    if (localName(current.name).toLowerCase() === name.toLowerCase()) found.push(current);
    for (let i = current.children.length - 1; i >= 0; i -= 1) todo.push(current.children[i]);
  }
  return found;
}

function runOrganizationRules(
  rules: ReadonlyArray<OrganizationRule>,
  summary: ModelSummary,
  diagnostics: Diagnostic[],
  suggestions: RepairSuggestion[]
): void {
  for (const rule of [...rules].sort((a, b) => a.code.localeCompare(b.code))) {
    try {
      if (!rule.check(summary)) {
        pushDiagnostic(diagnostics, rule.code, 'warning', 'quality', rule.message);
        suggestions.push({ code: rule.code, message: rule.message, operation: 'review-model' });
      }
    } catch {
      // A customer rule is user code. Do not expose its exception or model content.
      pushDiagnostic(diagnostics, 'QUALITY_RULE_FAILED', 'warning', 'quality', 'An organization quality rule could not be evaluated.');
    }
  }
}

/**
 * Validate a Model Exchange File Format shaped XML document without changing it.
 * This performs bounded XML well-formedness, structural subset, reference, and
 * conservative vocabulary checks. It is not an XSD validator or conformance claim.
 */
export function validateArchimateXml(xml: string, options: ValidatorOptions = {}): ValidationResult {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const semanticProfile = options.semanticProfile === undefined ? undefined :
    parseSemanticProfile(options.semanticProfile);
  const diagnostics: Diagnostic[] = [];
  const suggestions: RepairSuggestion[] = [];
  if (typeof xml !== 'string') {
    pushDiagnostic(diagnostics, 'XML_INPUT_TYPE', 'error', 'xml', 'Input must be an XML string.');
    return { diagnostics, suggestions, valid: false };
  }
  if (xml.length > limits.maxXmlBytes || new TextEncoder().encode(xml).byteLength > limits.maxXmlBytes) {
    pushDiagnostic(diagnostics, 'XML_SIZE_LIMIT', 'error', 'xml', 'XML size limit exceeded.');
    return { diagnostics, suggestions, valid: false };
  }

  const parsed = parseXml(xml, { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes });
  diagnostics.push(...parsed.diagnostics);
  const root = parsed.root;
  if (!root || parsed.diagnostics.some((item) => item.severity === 'error')) {
    return { diagnostics: sortDiagnostics(diagnostics), suggestions, valid: false };
  }

  const rootName = localName(root.name);
  if (rootName !== 'model' && rootName !== 'Model') {
    pushDiagnostic(diagnostics, 'SCHEMA_ROOT_UNSUPPORTED', 'error', 'schema', 'Root element must be an ArchiMate model.', root);
    return { diagnostics: sortDiagnostics(diagnostics), suggestions, valid: false };
  }
  if (!attribute(root, 'id') && !attribute(root, 'identifier')) {
    pushDiagnostic(diagnostics, 'SCHEMA_MODEL_ID_REQUIRED', 'error', 'schema', 'Model root must have an id or identifier.', root);
  }
  const allowedRootChildren = new Set(['name', 'documentation', 'elements', 'relationships', 'views', 'organizations', 'propertyDefinitions']);
  for (const child of root.children) {
    const name = localName(child.name).toLowerCase();
    if (!allowedRootChildren.has(name)) {
      pushDiagnostic(diagnostics, 'SCHEMA_EXTENSION_UNCHECKED', 'warning', 'schema', 'An extension element was not checked by the built-in profile.', child);
    }
  }

  const elements = [...descendants(root, 'element'), ...descendants(root, 'baseelement')];
  const relationships = descendants(root, 'relationship');
  const views = descendants(root, 'view');
  const identifiers = new Map<string, XmlNode>();
  const elementTypes = new Map<string, string>();
  const viewElementRefs = new Set<string>();

  const identifiable = [...elements, ...relationships, ...views];
  const missingReferences = new Set<string>();
  for (const node of identifiable) {
    const id = attribute(node, 'id') ?? attribute(node, 'identifier');
    if (!id) {
      pushDiagnostic(diagnostics, 'SCHEMA_ID_REQUIRED', 'error', 'schema', 'A model concept is missing its identifier.', node);
      continue;
    }
    if (identifiers.has(id)) {
      pushDiagnostic(diagnostics, 'STRUCTURE_DUPLICATE_ID', 'error', 'structure', 'Identifier is used more than once.', node, id);
    } else identifiers.set(id, node);
    if (['element', 'baseelement'].includes(localName(node.name).toLowerCase())) {
      const elementType = typeName(node);
      elementTypes.set(id, elementType);
      if (!knownElements.has(elementType)) {
        pushDiagnostic(diagnostics, 'SEMANTICS_ELEMENT_TYPE_UNKNOWN', 'warning', 'semantics', 'Element type is outside the built-in ArchiMate vocabulary.', node, id);
        suggestions.push({ code: 'REVIEW_ELEMENT_TYPE', subjectId: id, message: 'Review the element type against the organization profile.', operation: 'review-type' });
      }
    }
  }

  const relationshipIds = new Set(relationships.map((node) => attribute(node, 'id') ?? attribute(node, 'identifier')).filter((id): id is string => Boolean(id)));
  for (const node of relationships) {
    const id = attribute(node, 'id') ?? attribute(node, 'identifier') ?? '';
    const source = attribute(node, 'source');
    const target = attribute(node, 'target');
    if (!source || !target) {
      pushDiagnostic(diagnostics, 'SCHEMA_RELATIONSHIP_ENDPOINT_REQUIRED', 'error', 'schema', 'Relationship source and target are required.', node, id);
      continue;
    }
    if (!elementTypes.has(source) && !relationshipIds.has(source)) missingReferences.add(source);
    if (!elementTypes.has(target) && !relationshipIds.has(target)) missingReferences.add(target);
    if (source === target) {
      pushDiagnostic(diagnostics, 'SEMANTICS_SELF_RELATIONSHIP', 'warning', 'semantics', 'Relationship endpoints refer to the same concept; review the model against the selected ArchiMate profile.', node, id);
    }
    const relType = typeName(node);
    if (relType === 'relationship') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TYPE_UNSPECIFIED', 'warning', 'semantics', 'Relationship type is not specified in the built-in vocabulary.', node, id);
    }
    if (relType !== 'relationship' && !knownRelationships.has(relType)) {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TYPE_UNKNOWN', 'warning', 'semantics', 'Relationship type is outside the built-in ArchiMate vocabulary.', node, id);
      suggestions.push({ code: 'REVIEW_RELATIONSHIP_TYPE', subjectId: id, message: 'Review the relationship type against the organization profile.', operation: 'review-type' });
    }
  }

  const relationshipsById = new Map(relationships.flatMap((node) => {
    const id = attribute(node, 'id') ?? attribute(node, 'identifier');
    return id ? [[id, node] as const] : [];
  }));
  for (const node of relationships) {
    const id = attribute(node, 'id') ?? attribute(node, 'identifier') ?? '';
    const source = attribute(node, 'source');
    const target = attribute(node, 'target');
    if (!source || !target) continue;
    const sourceRelationship = relationshipsById.get(source);
    const targetRelationship = relationshipsById.get(target);
    const sourceType = elementTypes.get(source) ?? (sourceRelationship ? typeName(sourceRelationship) : undefined);
    const targetType = elementTypes.get(target) ?? (targetRelationship ? typeName(targetRelationship) : undefined);
    const relType = typeName(node);
    if (!sourceType || !targetType || relType === 'relationship' || !knownRelationships.has(relType)) continue;

    const semanticResult = validateRelationshipSemantics({
      sourceType,
      relationshipType: relType,
      targetType,
      sourceKind: sourceRelationship ? 'relationship' : junctionTypes.has(sourceType) ? 'junction' : 'element',
      targetKind: targetRelationship ? 'relationship' : junctionTypes.has(targetType) ? 'junction' : 'element'
    }, semanticProfile);
    if (semanticResult.decision === 'disallowed') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_DISALLOWED', 'error', 'semantics', 'The relationship combination is disallowed by the built-in ArchiMate 3.2 profile.', node, id);
    } else if (semanticResult.reasonCode === 'RELATIONSHIP_ENDPOINT_UNSUPPORTED') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TO_RELATIONSHIP_UNSUPPORTED', 'warning', 'semantics', 'Relationship-to-relationship semantics are not covered by the built-in profile.', node, id);
    } else if (semanticResult.reasonCode === 'JUNCTION_UNSUPPORTED') {
      pushDiagnostic(diagnostics, 'SEMANTICS_JUNCTION_UNSUPPORTED', 'warning', 'semantics', 'Junction semantics are not covered by the built-in profile.', node, id);
    } else if (semanticResult.decision === 'unsupported') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_COMBINATION_UNSUPPORTED', 'warning', 'semantics', 'The relationship combination is outside the built-in ArchiMate 3.2 decision set.', node, id);
    }
  }

  const viewNodeIds = new Set(descendants(root, 'node').map((node) => attribute(node, 'id')).filter((id): id is string => Boolean(id)));
  for (const node of descendants(root, 'node')) {
    const ref = attribute(node, 'elementRef') ?? attribute(node, 'element');
    if (ref) {
      viewElementRefs.add(ref);
      if (!elementTypes.has(ref)) missingReferences.add(ref);
    }
  }
  for (const node of descendants(root, 'connection')) {
    const rel = attribute(node, 'relationshipRef') ?? attribute(node, 'relationship');
    if (rel && !relationships.some((candidate) => (attribute(candidate, 'id') ?? attribute(candidate, 'identifier')) === rel)) {
      missingReferences.add(rel);
    }
    for (const endpoint of ['source', 'target']) {
      const ref = attribute(node, endpoint);
      if (ref && !viewNodeIds.has(ref)) missingReferences.add(ref);
    }
  }
  for (const ref of [...missingReferences].sort()) {
    pushDiagnostic(diagnostics, 'STRUCTURE_REFERENCE_UNRESOLVED', 'error', 'structure', 'A model reference does not resolve to a supported concept.', undefined, ref);
    suggestions.push({ code: 'REVIEW_UNRESOLVED_REFERENCE', subjectId: ref, message: 'Review the referenced concept and its identifier.', operation: 'review-reference' });
  }

  const summary: ModelSummary = {
    elements: elements.flatMap((node) => {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier');
      return id ? [{ id, type: typeName(node) }] : [];
    }),
    relationships: relationships.flatMap((node) => {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier');
      const source = attribute(node, 'source');
      const target = attribute(node, 'target');
      return id && source && target ? [{ id, type: typeName(node), source, target }] : [];
    }),
    views: views.flatMap((node) => {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier');
      return id ? [{ id }] : [];
    }),
    referencedElementIds: viewElementRefs
  };
  if (options.organizationRules?.length) runOrganizationRules(options.organizationRules, summary, diagnostics, suggestions);

  const orderedDiagnostics = sortDiagnostics(diagnostics);
  const orderedSuggestions = suggestions.sort((a, b) => a.code.localeCompare(b.code) || (a.subjectId ?? '').localeCompare(b.subjectId ?? ''));
  if (!options.includeSubjectIds) {
    for (const item of orderedDiagnostics) delete item.subjectId;
    for (const item of orderedSuggestions) delete item.subjectId;
  }
  return {
    diagnostics: orderedDiagnostics,
    suggestions: orderedSuggestions,
    ...(options.includeSummary ? { summary } : {}),
    valid: !orderedDiagnostics.some((item) => item.severity === 'error')
  };
}

export type { Diagnostic, OrganizationRule, RepairSuggestion, ValidationResult, ValidatorOptions } from './types';
export {
  RELATIONSHIP_SEMANTICS_VERSION,
  RELATIONSHIP_SEMANTIC_ROWS,
  parseSemanticProfile,
  validateRelationshipSemantics
} from './relationship-semantics.js';
export type {
  SemanticProfile,
  SemanticProfileKind,
  SemanticProfileRow,
  RelationshipEndpointKind,
  RelationshipSemanticDecision,
  RelationshipSemanticInput,
  RelationshipSemanticResult,
  RelationshipSemanticRow
} from './relationship-semantics.js';
