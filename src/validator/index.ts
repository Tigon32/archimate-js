import { SaxesParser } from 'saxes';

import {
  RELATIONSHIP_SEMANTICS_VERSION,
  parseSemanticProfile,
  validateRelationshipSemantics
} from './relationship-semantics.js';
import type { SemanticProfile } from './relationship-semantics.js';

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

interface XmlParseState {
  diagnostics: Diagnostic[];
  stack: XmlNode[];
  root?: XmlNode;
  nodeCount: number;
  blocked: boolean;
}

type XmlParseLimits = Required<Pick<ValidatorOptions, 'maxDepth' | 'maxNodes'>>;
type XmlInputLimits = Required<Pick<ValidatorOptions, 'maxXmlBytes'>> & XmlParseLimits;

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

function blockXmlParse(state: XmlParseState, code: string, message: string, node?: XmlNode): never {
  state.blocked = true;
  pushDiagnostic(state.diagnostics, code, 'error', 'xml', message, node);
  throw new Error(code);
}

function parseXmlAttributes(attributes: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
}

function createXmlNode(tag: { name: string; attributes: Record<string, unknown> },
  parser: SaxesParser): XmlNode {
  return {
    name: tag.name,
    attributes: parseXmlAttributes(tag.attributes),
    children: [],
    line: parser.line + 1,
    column: parser.column + 1
  };
}

function openXmlNode(state: XmlParseState, node: XmlNode): void {
  if (state.stack.length) state.stack[state.stack.length - 1].children.push(node);
  else if (state.root) {
    blockXmlParse(state, 'XML_MULTIPLE_ROOTS', 'XML must contain exactly one root element.', node);
  } else state.root = node;
  state.stack.push(node);
}

function handleOpenTag(state: XmlParseState, parser: SaxesParser,
  tag: { name: string; attributes: Record<string, unknown> },
  options: XmlParseLimits): void {
  if (state.blocked) return;
  state.nodeCount += 1;
  if (state.nodeCount > options.maxNodes) {
    blockXmlParse(state, 'XML_NODE_LIMIT', 'XML node limit exceeded.');
  }
  if (state.stack.length >= options.maxDepth) {
    blockXmlParse(state, 'XML_DEPTH_LIMIT', 'XML nesting limit exceeded.');
  }
  if (Object.keys(tag.attributes).length > 64) {
    blockXmlParse(state, 'XML_ATTRIBUTE_LIMIT', 'XML attribute limit exceeded.');
  }
  openXmlNode(state, createXmlNode(tag, parser));
}

function parseXml(xml: string, options: XmlParseLimits): {
  root?: XmlNode;
  diagnostics: Diagnostic[];
} {
  const state: XmlParseState = { diagnostics: [], stack: [], nodeCount: 0, blocked: false };
  const parser = new SaxesParser({ xmlns: false, fragment: false });

  parser.on('doctype', () => {
    blockXmlParse(state, 'XML_DTD_FORBIDDEN', 'DOCTYPE declarations are not accepted.');
  });
  parser.on('opentag', (tag) => { handleOpenTag(state, parser, tag, options); });
  parser.on('closetag', () => { state.stack.pop(); });
  parser.on('error', () => {
    if (!state.blocked) {
      pushDiagnostic(state.diagnostics, 'XML_MALFORMED', 'error', 'xml', 'XML is malformed or contains unsupported syntax.');
    }
  });

  try {
    parser.write(xml).close();
  } catch {
    if (!state.blocked && state.diagnostics.length === 0) {
      pushDiagnostic(state.diagnostics, 'XML_MALFORMED', 'error', 'xml', 'XML is malformed or contains unsupported syntax.');
    }
  }
  if (!state.root && state.diagnostics.length === 0) {
    pushDiagnostic(state.diagnostics, 'XML_EMPTY', 'error', 'xml', 'XML contains no root element.');
  }
  return { root: state.root, diagnostics: state.diagnostics };
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

  interface ValidationParts {
    elements: XmlNode[];
    relationships: XmlNode[];
    views: XmlNode[];
    identifiers: Map<string, XmlNode>;
    elementTypes: Map<string, string>;
    viewElementRefs: Set<string>;
    missingReferences: Set<string>;
  }

  function invalidXmlInput(xml: string, limits: XmlInputLimits,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): ValidationResult | undefined {
    if (typeof xml !== 'string') {
      pushDiagnostic(diagnostics, 'XML_INPUT_TYPE', 'error', 'xml', 'Input must be an XML string.');
      return { diagnostics, suggestions, valid: false };
    }
    if (xml.length > limits.maxXmlBytes || new TextEncoder().encode(xml).byteLength > limits.maxXmlBytes) {
      pushDiagnostic(diagnostics, 'XML_SIZE_LIMIT', 'error', 'xml', 'XML size limit exceeded.');
      return { diagnostics, suggestions, valid: false };
    }
    return undefined;
  }

  function parseValidRoot(xml: string, limits: XmlParseLimits,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): XmlNode | ValidationResult {
    const parsed = parseXml(xml, { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes });
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.root || parsed.diagnostics.some((item) => item.severity === 'error')) {
      return { diagnostics: sortDiagnostics(diagnostics), suggestions, valid: false };
    }
    return parsed.root;
  }

  function checkRoot(root: XmlNode, diagnostics: Diagnostic[],
    suggestions: RepairSuggestion[]): ValidationResult | undefined {
    const rootName = localName(root.name);
    if (rootName !== 'model' && rootName !== 'Model') {
      pushDiagnostic(diagnostics, 'SCHEMA_ROOT_UNSUPPORTED', 'error', 'schema',
        'Root element must be an ArchiMate model.', root);
      return { diagnostics: sortDiagnostics(diagnostics), suggestions, valid: false };
    }
    if (!attribute(root, 'id') && !attribute(root, 'identifier')) {
      pushDiagnostic(diagnostics, 'SCHEMA_MODEL_ID_REQUIRED', 'error', 'schema',
        'Model root must have an id or identifier.', root);
    }
    return undefined;
  }

  function checkRootChildren(root: XmlNode, diagnostics: Diagnostic[]): void {
    const allowed = new Set(['name', 'documentation', 'elements', 'relationships', 'views',
      'organizations', 'propertyDefinitions']);
    for (const child of root.children) {
      const name = localName(child.name).toLowerCase();
      if (!allowed.has(name)) {
        pushDiagnostic(diagnostics, 'SCHEMA_EXTENSION_UNCHECKED', 'warning', 'schema',
          'An extension element was not checked by the built-in profile.', child);
      }
  }
}

  function collectParts(root: XmlNode): ValidationParts {
    return {
      elements: [...descendants(root, 'element'), ...descendants(root, 'baseelement')],
      relationships: descendants(root, 'relationship'),
      views: descendants(root, 'view'),
      identifiers: new Map<string, XmlNode>(),
      elementTypes: new Map<string, string>(),
      viewElementRefs: new Set<string>(),
      missingReferences: new Set<string>()
    };
  }

  function rememberIdentifier(parts: ValidationParts, node: XmlNode,
    diagnostics: Diagnostic[]): string | undefined {
    const id = attribute(node, 'id') ?? attribute(node, 'identifier');
    if (!id) {
      pushDiagnostic(diagnostics, 'SCHEMA_ID_REQUIRED', 'error', 'schema',
        'A model concept is missing its identifier.', node);
      return undefined;
    }
    if (parts.identifiers.has(id)) {
      pushDiagnostic(diagnostics, 'STRUCTURE_DUPLICATE_ID', 'error', 'structure',
        'Identifier is used more than once.', node, id);
    } else parts.identifiers.set(id, node);
    return id;
  }

  function recordElementType(parts: ValidationParts, node: XmlNode, id: string,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    if (!['element', 'baseelement'].includes(localName(node.name).toLowerCase())) return;
    const elementType = typeName(node);
    parts.elementTypes.set(id, elementType);
    if (!knownElements.has(elementType)) {
      pushDiagnostic(diagnostics, 'SEMANTICS_ELEMENT_TYPE_UNKNOWN', 'warning', 'semantics',
        'Element type is outside the built-in ArchiMate vocabulary.', node, id);
      suggestions.push({ code: 'REVIEW_ELEMENT_TYPE', subjectId: id,
        message: 'Review the element type against the organization profile.', operation: 'review-type' });
    }
  }

  function checkIdentifiableConcepts(parts: ValidationParts,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    for (const node of [...parts.elements, ...parts.relationships, ...parts.views]) {
      const id = rememberIdentifier(parts, node, diagnostics);
      if (id) recordElementType(parts, node, id, diagnostics, suggestions);
    }
  }

  function relationshipIds(parts: ValidationParts): Set<string> {
    return new Set(parts.relationships
      .map((node) => attribute(node, 'id') ?? attribute(node, 'identifier'))
      .filter((id): id is string => Boolean(id)));
  }

  function checkRelationshipBasics(parts: ValidationParts,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    const ids = relationshipIds(parts);
    for (const node of parts.relationships) {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier') ?? '';
      const source = attribute(node, 'source');
      const target = attribute(node, 'target');
      if (!source || !target) {
        pushDiagnostic(diagnostics, 'SCHEMA_RELATIONSHIP_ENDPOINT_REQUIRED', 'error', 'schema',
          'Relationship source and target are required.', node, id);
        continue;
      }
      if (!parts.elementTypes.has(source) && !ids.has(source)) parts.missingReferences.add(source);
      if (!parts.elementTypes.has(target) && !ids.has(target)) parts.missingReferences.add(target);
      checkRelationshipType(node, id, diagnostics, suggestions);
      if (source === target) {
        pushDiagnostic(diagnostics, 'SEMANTICS_SELF_RELATIONSHIP', 'warning', 'semantics',
          'Relationship endpoints refer to the same concept; review the model against the selected ArchiMate profile.',
          node, id);
      }
    }
  }

  function checkRelationshipType(node: XmlNode, id: string,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    const relType = typeName(node);
    if (relType === 'relationship') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TYPE_UNSPECIFIED', 'warning', 'semantics',
        'Relationship type is not specified in the built-in vocabulary.', node, id);
    }
    if (relType !== 'relationship' && !knownRelationships.has(relType)) {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TYPE_UNKNOWN', 'warning', 'semantics',
        'Relationship type is outside the built-in ArchiMate vocabulary.', node, id);
      suggestions.push({ code: 'REVIEW_RELATIONSHIP_TYPE', subjectId: id,
        message: 'Review the relationship type against the organization profile.', operation: 'review-type' });
    }
  }

  function relationshipMap(parts: ValidationParts): Map<string, XmlNode> {
    return new Map(parts.relationships.flatMap((node) => {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier');
      return id ? [[id, node] as const] : [];
    }));
  }

  function conceptType(parts: ValidationParts, relationshipsById: Map<string, XmlNode>,
    id: string | undefined): string | undefined {
    if (!id) return undefined;
    const relationship = relationshipsById.get(id);
    return parts.elementTypes.get(id) ?? (relationship ? typeName(relationship) : undefined);
  }

  function checkSemanticResult(result: ReturnType<typeof validateRelationshipSemantics>,
    diagnostics: Diagnostic[], node: XmlNode, id: string): void {
    if (result.decision === 'disallowed') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_DISALLOWED', 'error', 'semantics',
        'The relationship combination is disallowed by the built-in ArchiMate 3.2 profile.', node, id);
    } else if (result.reasonCode === 'RELATIONSHIP_ENDPOINT_UNSUPPORTED') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_TO_RELATIONSHIP_UNSUPPORTED', 'warning', 'semantics',
        'Relationship-to-relationship semantics are not covered by the built-in profile.', node, id);
    } else if (result.reasonCode === 'JUNCTION_UNSUPPORTED') {
      pushDiagnostic(diagnostics, 'SEMANTICS_JUNCTION_UNSUPPORTED', 'warning', 'semantics',
        'Junction semantics are not covered by the built-in profile.', node, id);
    } else if (result.decision === 'unsupported') {
      pushDiagnostic(diagnostics, 'SEMANTICS_RELATIONSHIP_COMBINATION_UNSUPPORTED', 'warning', 'semantics',
        'The relationship combination is outside the built-in ArchiMate 3.2 decision set.', node, id);
    }
  }

  function checkRelationshipSemantics(parts: ValidationParts, diagnostics: Diagnostic[],
    semanticProfile?: SemanticProfile): void {
    const relationshipsById = relationshipMap(parts);
    for (const node of parts.relationships) {
      const id = attribute(node, 'id') ?? attribute(node, 'identifier') ?? '';
      const source = attribute(node, 'source');
      const target = attribute(node, 'target');
      const relType = typeName(node);
      const sourceType = conceptType(parts, relationshipsById, source);
      const targetType = conceptType(parts, relationshipsById, target);
      if (!sourceType || !targetType || relType === 'relationship' || !knownRelationships.has(relType)) continue;
      checkSemanticResult(validateRelationshipSemantics({
        sourceType, relationshipType: relType, targetType,
        sourceKind: relationshipsById.has(source ?? '') ? 'relationship' :
          junctionTypes.has(sourceType) ? 'junction' : 'element',
        targetKind: relationshipsById.has(target ?? '') ? 'relationship' :
          junctionTypes.has(targetType) ? 'junction' : 'element'
      }, semanticProfile), diagnostics, node, id);
    }
  }

  function checkViewNodeReferences(root: XmlNode, parts: ValidationParts): Set<string> {
    const viewNodeIds = new Set(descendants(root, 'node')
      .map((node) => attribute(node, 'id'))
      .filter((id): id is string => Boolean(id)));
    for (const node of descendants(root, 'node')) {
      const ref = attribute(node, 'elementRef') ?? attribute(node, 'element');
      if (ref) {
        parts.viewElementRefs.add(ref);
        if (!parts.elementTypes.has(ref)) parts.missingReferences.add(ref);
      }
    }
    return viewNodeIds;
  }

  function hasRelationship(parts: ValidationParts, id: string): boolean {
    return parts.relationships.some((node) =>
      (attribute(node, 'id') ?? attribute(node, 'identifier')) === id);
  }

  function checkConnectionReferences(root: XmlNode, parts: ValidationParts,
    viewNodeIds: ReadonlySet<string>): void {
    for (const node of descendants(root, 'connection')) {
      const rel = attribute(node, 'relationshipRef') ?? attribute(node, 'relationship');
      if (rel && !hasRelationship(parts, rel)) parts.missingReferences.add(rel);
      for (const endpoint of ['source', 'target']) {
        const ref = attribute(node, endpoint);
        if (ref && !viewNodeIds.has(ref)) parts.missingReferences.add(ref);
      }
    }
  }

  function reportMissingReferences(parts: ValidationParts,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    for (const ref of [...parts.missingReferences].sort()) {
      pushDiagnostic(diagnostics, 'STRUCTURE_REFERENCE_UNRESOLVED', 'error', 'structure',
        'A model reference does not resolve to a supported concept.', undefined, ref);
      suggestions.push({ code: 'REVIEW_UNRESOLVED_REFERENCE', subjectId: ref,
        message: 'Review the referenced concept and its identifier.', operation: 'review-reference' });
    }
  }

  function checkViewReferences(root: XmlNode, parts: ValidationParts,
    diagnostics: Diagnostic[], suggestions: RepairSuggestion[]): void {
    const viewNodeIds = checkViewNodeReferences(root, parts);
    checkConnectionReferences(root, parts, viewNodeIds);
    reportMissingReferences(parts, diagnostics, suggestions);
  }

  function buildSummary(parts: ValidationParts): ModelSummary {
    return {
      elements: parts.elements.flatMap((node) => {
        const id = attribute(node, 'id') ?? attribute(node, 'identifier');
        return id ? [{ id, type: typeName(node) }] : [];
      }),
      relationships: parts.relationships.flatMap((node) => {
        const id = attribute(node, 'id') ?? attribute(node, 'identifier');
        const source = attribute(node, 'source');
        const target = attribute(node, 'target');
        return id && source && target ? [{ id, type: typeName(node), source, target }] : [];
      }),
      views: parts.views.flatMap((node) => {
        const id = attribute(node, 'id') ?? attribute(node, 'identifier');
        return id ? [{ id }] : [];
      }),
      referencedElementIds: parts.viewElementRefs
    };
  }

  function finalizeValidation(options: ValidatorOptions, diagnostics: Diagnostic[],
    suggestions: RepairSuggestion[], summary: ModelSummary): ValidationResult {
    const orderedDiagnostics = sortDiagnostics(diagnostics);
    const orderedSuggestions = suggestions.sort((a, b) =>
      a.code.localeCompare(b.code) || (a.subjectId ?? '').localeCompare(b.subjectId ?? ''));
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
  const inputError = invalidXmlInput(xml, limits, diagnostics, suggestions);
  if (inputError) return inputError;
  const rootOrResult = parseValidRoot(xml, limits, diagnostics, suggestions);
  if (!('children' in rootOrResult)) return rootOrResult;
  const rootError = checkRoot(rootOrResult, diagnostics, suggestions);
  if (rootError) return rootError;

  checkRootChildren(rootOrResult, diagnostics);
  const parts = collectParts(rootOrResult);
  checkIdentifiableConcepts(parts, diagnostics, suggestions);
  checkRelationshipBasics(parts, diagnostics, suggestions);
  checkRelationshipSemantics(parts, diagnostics, semanticProfile);
  checkViewReferences(rootOrResult, parts, diagnostics, suggestions);

  const summary = buildSummary(parts);
  if (options.organizationRules?.length) runOrganizationRules(options.organizationRules, summary, diagnostics, suggestions);
  return finalizeValidation(options, diagnostics, suggestions, summary);
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
