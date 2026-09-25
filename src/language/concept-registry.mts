/**
 * Current implementation inventory for element concepts and their renderer keys.
 *
 * This is not a standards profile or an assertion of exhaustive language support.
 */

export const CONCEPT_REGISTRY_VERSION = '1' as const;

export type ConceptLayer =
  | 'Motivation' | 'Strategy' | 'Business' | 'Application'
  | 'Technology' | 'Physical' | 'Implementation & Migration' | 'Other';
export type ConceptAspect = 'Passive structure' | 'Behavior' | 'Active structure' | 'Motivation';
export type RendererDomain = 'strategy' | 'business' | 'application' | 'technology' | 'motivation' | 'implementation' | 'common';

export interface ConceptRendererMetadata {
  domain: RendererDomain;
  iconKey: string;
  shapeKey: string;
  grouping: boolean;
}

export interface ConceptRecord {
  canonicalId: string;
  type: string;
  category: 'element';
  layer: ConceptLayer;
  aspect: ConceptAspect;
  aliases: readonly string[];
  renderer: ConceptRendererMetadata;
}

export interface ConceptRegistry {
  records: readonly ConceptRecord[];
  byAlias: ReadonlyMap<string, ConceptRecord>;
  byCanonicalId: ReadonlyMap<string, ConceptRecord>;
  byType: ReadonlyMap<string, ConceptRecord>;
}

type InventoryRow = readonly [string, ConceptLayer, ConceptAspect];

const inventory: readonly InventoryRow[] = [
  ['Assessment', 'Motivation', 'Motivation'], ['Constraint', 'Motivation', 'Motivation'],
  ['Driver', 'Motivation', 'Motivation'], ['Goal', 'Motivation', 'Motivation'],
  ['Meaning', 'Motivation', 'Motivation'], ['Outcome', 'Motivation', 'Motivation'],
  ['Principle', 'Motivation', 'Motivation'], ['Requirement', 'Motivation', 'Motivation'],
  ['Stakeholder', 'Motivation', 'Motivation'], ['Value', 'Motivation', 'Motivation'],
  ['Capability', 'Strategy', 'Behavior'], ['ValueStream', 'Strategy', 'Behavior'],
  ['CourseOfAction', 'Strategy', 'Behavior'], ['Resource', 'Strategy', 'Active structure'],
  ['BusinessActor', 'Business', 'Active structure'], ['BusinessCollaboration', 'Business', 'Active structure'],
  ['BusinessEvent', 'Business', 'Behavior'], ['BusinessFunction', 'Business', 'Behavior'],
  ['BusinessInteraction', 'Business', 'Behavior'], ['BusinessInterface', 'Business', 'Active structure'],
  ['BusinessObject', 'Business', 'Passive structure'], ['BusinessProcess', 'Business', 'Behavior'],
  ['BusinessRole', 'Business', 'Active structure'], ['BusinessService', 'Business', 'Behavior'],
  ['Contract', 'Business', 'Passive structure'], ['Product', 'Business', 'Passive structure'],
  ['Representation', 'Business', 'Passive structure'], ['ApplicationCollaboration', 'Application', 'Active structure'],
  ['ApplicationComponent', 'Application', 'Active structure'], ['ApplicationEvent', 'Application', 'Behavior'],
  ['ApplicationFunction', 'Application', 'Behavior'], ['ApplicationInteraction', 'Application', 'Behavior'],
  ['ApplicationInterface', 'Application', 'Active structure'], ['ApplicationProcess', 'Application', 'Behavior'],
  ['ApplicationService', 'Application', 'Behavior'], ['DataObject', 'Application', 'Passive structure'],
  ['Artifact', 'Technology', 'Passive structure'], ['CommunicationNetwork', 'Technology', 'Active structure'],
  ['Device', 'Technology', 'Active structure'], ['Node', 'Technology', 'Active structure'],
  ['Path', 'Technology', 'Active structure'], ['SystemSoftware', 'Technology', 'Active structure'],
  ['TechnologyCollaboration', 'Technology', 'Active structure'], ['TechnologyEvent', 'Technology', 'Behavior'],
  ['TechnologyFunction', 'Technology', 'Behavior'], ['TechnologyInteraction', 'Technology', 'Behavior'],
  ['TechnologyInterface', 'Technology', 'Active structure'], ['TechnologyProcess', 'Technology', 'Behavior'],
  ['TechnologyService', 'Technology', 'Behavior'], ['DistributionNetwork', 'Physical', 'Active structure'],
  ['Equipment', 'Physical', 'Active structure'], ['Facility', 'Physical', 'Active structure'],
  ['Material', 'Physical', 'Active structure'], ['Deliverable', 'Implementation & Migration', 'Active structure'],
  ['ImplementationEvent', 'Implementation & Migration', 'Behavior'], ['WorkPackage', 'Implementation & Migration', 'Behavior'],
  ['Gap', 'Implementation & Migration', 'Active structure'], ['Plateau', 'Implementation & Migration', 'Active structure'],
  ['Location', 'Other', 'Active structure'], ['Grouping', 'Other', 'Active structure']
];

const iconAliases: Readonly<Record<string, string>> = Object.freeze({
  BusinessRole: 'Role', BusinessCollaboration: 'Collaboration',
  ApplicationCollaboration: 'Collaboration', TechnologyCollaboration: 'Collaboration',
  BusinessProcess: 'Process', ApplicationProcess: 'Process', TechnologyProcess: 'Process',
  BusinessFunction: 'Function', ApplicationFunction: 'Function', TechnologyFunction: 'Function',
  BusinessService: 'Service', ApplicationService: 'Service', TechnologyService: 'Service',
  BusinessEvent: 'Event', ApplicationEvent: 'Event', TechnologyEvent: 'Event',
  ImplementationEvent: 'Event'
});

const rendererDomainByLayer: Readonly<Record<ConceptLayer, RendererDomain>> = Object.freeze({
  Strategy: 'strategy', Business: 'business', Application: 'application',
  Technology: 'technology', Physical: 'technology', Motivation: 'motivation',
  'Implementation & Migration': 'implementation', Other: 'common'
});

const canonicalId = (type: string): string =>
  `concept/${type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

const shapeKey = (type: string): string =>
  type.replace(/^(Business|Application|Technology|Implementation)/, '');

const toRecord = ([type, layer, aspect]: InventoryRow): ConceptRecord => Object.freeze({
  canonicalId: canonicalId(type),
  type,
  category: 'element',
  layer,
  aspect,
  aliases: Object.freeze([type, `archimate:${type}`]),
  renderer: Object.freeze({
    domain: rendererDomainByLayer[layer],
    iconKey: iconAliases[type] ?? type,
    shapeKey: shapeKey(type),
    grouping: type === 'Grouping'
  })
});

const register = <T,>(map: Map<string, T>, key: string, value: T, kind: string): void => {
  if (map.has(key)) throw new Error(`Concept registry ${kind} "${key}" is not unique.`);
  map.set(key, value);
};

export function createConceptRegistry(records: readonly ConceptRecord[]): ConceptRegistry {
  const byAlias = new Map<string, ConceptRecord>();
  const byCanonicalId = new Map<string, ConceptRecord>();
  const byType = new Map<string, ConceptRecord>();
  for (const record of records) {
    register(byCanonicalId, record.canonicalId, record, 'canonical ID');
    register(byType, record.type, record, 'type');
    record.aliases.forEach((alias) => register(byAlias, alias, record, 'alias'));
  }
  return Object.freeze({
    records: Object.freeze([...records]),
    byAlias,
    byCanonicalId,
    byType
  });
}

export const CONCEPT_RECORDS: readonly ConceptRecord[] = Object.freeze(inventory.map(toRecord));
export const CONCEPT_REGISTRY = createConceptRegistry(CONCEPT_RECORDS);

export const resolveConcept = (identity: string): ConceptRecord | undefined =>
  CONCEPT_REGISTRY.byAlias.get(identity) ?? CONCEPT_REGISTRY.byCanonicalId.get(identity);
