import type { PerformanceTier } from './performance-contract.mts';

export type Point = { x: number; y: number };
export type DiagramNode = {
  $type: 'archimate:Node';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nodes: DiagramNode[];
};
export type DiagramConnection = {
  $type: 'archimate:Connection';
  id: string;
  source: DiagramNode;
  target: DiagramNode;
  type: string;
  relationshipRef: { id: string; type: string };
  waypointsNode: { waypoints: Point[] };
};
export type DiagramView = {
  id: string;
  viewElements: Array<DiagramNode | DiagramConnection>;
};
export type SyntheticModel = {
  tier: PerformanceTier;
  provenance: 'SYNTHETIC';
  semanticXml: string;
  xml: string;
  view: DiagramView;
  elementCount: number;
  relationshipCount: number;
  nodeCount: number;
  connectionCount: number;
};

const NODE_WIDTH = 120;
const NODE_HEIGHT = 60;
const HORIZONTAL_GAP = 70;
const VERTICAL_GAP = 60;

function pad(index: number): string {
  return String(index).padStart(4, '0');
}

function createNodes(size: number): DiagramNode[] {
  const columns = Math.ceil(Math.sqrt(size));
  return Array.from({ length: size }, (_, index) => ({
    $type: 'archimate:Node',
    id: `synthetic-node-${pad(index)}`,
    x: 40 + (index % columns) * (NODE_WIDTH + HORIZONTAL_GAP),
    y: 40 + Math.floor(index / columns) * (NODE_HEIGHT + VERTICAL_GAP),
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
    nodes: []
  }));
}

function createConnections(nodes: DiagramNode[]): DiagramConnection[] {
  return nodes.slice(1).map((target, index) => ({
    $type: 'archimate:Connection',
    id: `synthetic-connection-${pad(index)}`,
    source: nodes[index],
    target,
    type: 'Triggering',
    relationshipRef: {
      id: `synthetic-relationship-${pad(index)}`,
      type: 'Triggering'
    },
    waypointsNode: { waypoints: [] }
  }));
}

function elementXml(index: number): string {
  const id = `synthetic-element-${pad(index)}`;
  return `<element identifier="${id}" xsi:type="archimate:ApplicationProcess">` +
    `<name xml:lang="en">Synthetic process ${pad(index)}</name></element>`;
}

function semanticRelationshipXml(index: number): string {
  return `<relationship identifier="synthetic-relationship-${pad(index)}" ` +
    'xsi:type="archimate:TriggeringRelationship" ' +
    `source="synthetic-element-${pad(index)}" target="synthetic-element-${pad(index + 1)}"/>`;
}

function browserRelationshipXml(index: number): string {
  return `<relationship identifier="synthetic-relationship-${pad(index)}" ` +
    'xsi:type="archimate:Triggering" ' +
    `source="synthetic-element-${pad(index)}" target="synthetic-element-${pad(index + 1)}"/>`;
}

function nodeXml(node: DiagramNode, index: number): string {
  return `<node identifier="${node.id}" xsi:type="archimate:Element" ` +
    `elementRef="synthetic-element-${pad(index)}" x="${node.x}" y="${node.y}" ` +
    `w="${node.w}" h="${node.h}"/>`;
}

function connectionXml(connection: DiagramConnection): string {
  return `<connection identifier="${connection.id}" xsi:type="archimate:Relationship" ` +
    `relationshipRef="${connection.relationshipRef.id}" source="${connection.source.id}" ` +
    `target="${connection.target.id}"/>`;
}

function modelXml(tier: PerformanceTier, nodes: DiagramNode[], connections: DiagramConnection[]): string {
  const elements = nodes.map((_, index) => elementXml(index)).join('');
  const relationships = connections.map((_, index) => browserRelationshipXml(index)).join('');
  const diagramNodes = nodes.map(nodeXml).join('');
  const diagramConnections = connections.map(connectionXml).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<!-- Classification: SYNTHETIC; deterministic performance fixture. -->' +
    '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" ' +
    'xmlns:archimate="http://www.opengroup.org/xsd/archimate/3.0/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    `identifier="synthetic-model-${tier.name}">` +
    `<name xml:lang="en">Synthetic ${tier.name} performance model</name>` +
    `<elements>${elements}</elements><relationships>${relationships}</relationships>` +
    '<views><diagrams>' +
    '<view identifier="view-synthetic-showcase" xsi:type="archimate:Diagram">' +
    `<name xml:lang="en">Synthetic ${tier.name} performance view</name>` +
    `${diagramNodes}${diagramConnections}</view></diagrams></views></model>`;
}

function validatorXml(tier: PerformanceTier, nodes: DiagramNode[], connections: DiagramConnection[]): string {
  const elements = nodes.map((_, index) => elementXml(index)
    .replace('identifier=', 'id=')).join('');
  const relationships = connections.map((_, index) => semanticRelationshipXml(index)
    .replace('identifier=', 'id=')).join('');
  return '<?xml version="1.0"?>' +
    `<model id="synthetic-model-${tier.name}" ` +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<elements>${elements}</elements><relationships>${relationships}</relationships></model>`;
}

export function createSyntheticModel(tier: PerformanceTier): SyntheticModel {
  if (!Number.isInteger(tier.size) || tier.size < 2) {
    throw new TypeError('Synthetic performance tiers require at least two nodes');
  }
  const nodes = createNodes(tier.size);
  const connections = createConnections(nodes);
  return {
    tier,
    provenance: 'SYNTHETIC',
    semanticXml: validatorXml(tier, nodes, connections),
    xml: modelXml(tier, nodes, connections),
    view: {
      id: 'view-synthetic-showcase',
      viewElements: [ ...nodes, ...connections ]
    },
    elementCount: tier.size,
    relationshipCount: connections.length,
    nodeCount: nodes.length,
    connectionCount: connections.length
  };
}

export function isDiagramNode(
  element: DiagramNode | DiagramConnection
): element is DiagramNode {
  return element.$type === 'archimate:Node';
}

export function isDiagramConnection(
  element: DiagramNode | DiagramConnection
): element is DiagramConnection {
  return element.$type === 'archimate:Connection';
}
