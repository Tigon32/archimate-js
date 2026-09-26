import type { ModelDto, RelationshipDto, ViewConnectionDto, ViewNodeDto } from '../model-dto/index.js';
import type { LayoutOptions } from './types.js';

export interface LayoutQualityCorpusCase {
  id: string;
  description: string;
  provenance: 'SYNTHETIC';
  coverage: readonly string[];
  model: ModelDto;
  viewId: string;
  options?: Omit<LayoutOptions, 'strategy'>;
}

type NodeInput = Omit<ViewNodeDto, 'kind' | 'nodes'> & { nodes?: ViewNodeDto[]; kind?: ViewNodeDto['kind'] };

function node(input: NodeInput): ViewNodeDto {
  return { kind: 'element', nodes: [], ...input };
}

function container(id: string, x: number, y: number, width: number, height: number,
  nodes: ViewNodeDto[], label: string): ViewNodeDto {
  return { id, kind: 'container', x, y, width, height, label, nodes };
}

function edge(id: string, relationshipId: string, sourceId: string, targetId: string,
  waypoints: ViewConnectionDto['waypoints']): ViewConnectionDto {
  return { id, kind: 'relationship', relationshipId, sourceId, targetId, waypoints };
}

function relationship(id: string, sourceId: string, targetId: string): RelationshipDto {
  return { id, type: 'AssociationRelationship', sourceId, targetId };
}

function model(id: string, nodes: ViewNodeDto[], connections: ViewConnectionDto[],
  relationships: RelationshipDto[]): ModelDto {
  const conceptIds = new Set<string>();
  const collect = (items: readonly ViewNodeDto[]): void => items.forEach((item) => {
    if (item.elementId) conceptIds.add(item.elementId);
    collect(item.nodes);
  });
  collect(nodes);
  return { schemaVersion: 1, id, name: `SYNTHETIC ${id}`, diagnostics: [],
    elements: [...conceptIds].sort().map((conceptId) => ({ id: conceptId,
      type: 'ApplicationComponent', name: conceptId })),
    relationships, views: [{ id: `${id}-view`, name: `SYNTHETIC ${id}`, nodes, connections }] };
}

function nestedCrossHierarchy(): LayoutQualityCorpusCase {
  const service = node({ id: 'service', elementId: 'concept-service', x: 60, y: 70,
    width: 120, height: 54, label: 'Service' });
  const worker = node({ id: 'worker', elementId: 'concept-worker', x: 80, y: 145,
    width: 120, height: 54, label: 'Worker' });
  const api = node({ id: 'api', elementId: 'concept-api', x: 360, y: 120,
    width: 120, height: 54, label: 'API' });
  const nodes = [container('group-a', 30, 40, 230, 190, [service, worker], 'Group A'), api];
  const relationships = [relationship('rel-service-api', 'concept-service', 'concept-api'),
    relationship('rel-worker-api', 'concept-worker', 'concept-api')];
  const connections = [edge('edge-service-api', relationships[0].id, 'service', 'api',
    [{ x: 180, y: 97 }, { x: 360, y: 147 }])];
  return corpusCase('nested-cross-hierarchy', nodes, connections, relationships,
    ['nested groups', 'cross-hierarchy edges', 'labels']);
}

function cyclicMultiSelf(): LayoutQualityCorpusCase {
  const nodes = ['a', 'b', 'c'].map((id, index) => node({ id: `node-${id}`,
    elementId: `concept-${id}`, x: 70 + index * 135, y: index % 2 ? 155 : 55,
    width: 92, height: 50, label: `Cycle ${id.toUpperCase()}` }));
  const pairs = [['a-b', 'a', 'b'], ['b-c', 'b', 'c'], ['c-a', 'c', 'a'],
    ['a-b-2', 'a', 'b'], ['self-b', 'b', 'b']];
  const relationships = pairs.map(([id, source, target]) =>
    relationship(`rel-${id}`, `concept-${source}`, `concept-${target}`));
  const connections = relationships.map((rel, index) => edge(`edge-${rel.id.slice(4)}`, rel.id,
    `node-${pairs[index][1]}`, `node-${pairs[index][2]}`, routeFor(index)));
  return corpusCase('cycles-multiedges-selfloop', nodes, connections, relationships,
    ['cycles', 'multi-edges', 'self-loops']);
}

function routeFor(index: number): ViewConnectionDto['waypoints'] {
  const routes = [
    [{ x: 162, y: 80 }, { x: 205, y: 180 }],
    [{ x: 297, y: 180 }, { x: 340, y: 80 }],
    [{ x: 340, y: 80 }, { x: 110, y: 80 }],
    [{ x: 162, y: 105 }, { x: 205, y: 205 }],
    [{ x: 251, y: 155 }, { x: 251, y: 130 }, { x: 285, y: 130 }, { x: 285, y: 155 }]
  ];
  return routes[index].map((point, pointIndex, all) => ({ ...point,
    kind: pointIndex === 0 ? 'sourceAttachment' : pointIndex === all.length - 1 ? 'targetAttachment' : 'bendpoint' }));
}

function pinnedDense(): LayoutQualityCorpusCase {
  const nodes = Array.from({ length: 9 }, (_, index) => node({ id: `dense-${index}`,
    elementId: `concept-dense-${index}`, x: 40 + index % 3 * 95, y: 40 + Math.floor(index / 3) * 70,
    width: 88, height: 46, label: `Dense ${index}` }));
  const relationships = densePairs().map(([source, target], index) =>
    relationship(`rel-dense-${index}`, `concept-dense-${source}`, `concept-dense-${target}`));
  const connections = densePairs().map(([source, target], index) => edge(`edge-dense-${index}`,
    relationships[index].id, `dense-${source}`, `dense-${target}`,
    [{ x: 84 + source % 3 * 95, y: 63 + Math.floor(source / 3) * 70 },
      { x: 84 + target % 3 * 95, y: 63 + Math.floor(target / 3) * 70 }]));
  return { ...corpusCase('dense-pinned-view', nodes, connections, relationships,
    ['dense views', 'pins', 'labels']), options: { routeConnections: false,
    pins: [{ nodeId: 'dense-4', strength: 'hard' }] } };
}

function densePairs(): Array<[number, number]> {
  return [[0, 8], [2, 6], [1, 7], [3, 5], [0, 4], [4, 8], [2, 4], [4, 6], [3, 7], [1, 5]];
}

function corpusCase(id: string, nodes: ViewNodeDto[], connections: ViewConnectionDto[],
  relationships: RelationshipDto[], coverage: readonly string[]): LayoutQualityCorpusCase {
  return { id, description: `Programmatically generated ${id} layout-quality case.`,
    provenance: 'SYNTHETIC', coverage, model: model(id, nodes, connections, relationships),
    viewId: `${id}-view` };
}

export function layoutQualityCorpus(): LayoutQualityCorpusCase[] {
  return [nestedCrossHierarchy(), cyclicMultiSelf(), pinnedDense()];
}
