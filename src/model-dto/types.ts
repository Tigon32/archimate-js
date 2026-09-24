/** Project-owned persistent data; parser and diagram-js objects never appear here. */
export interface DtoDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  stage: 'parse' | 'projection' | 'validation';
  message: string;
}

export interface PointDto {
  x: number;
  y: number;
  kind?: 'sourceAttachment' | 'bendpoint' | 'targetAttachment';
}

export interface StyleDto {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

export interface ElementDto {
  id: string;
  type: string;
  name?: string;
  documentation?: string;
}

export interface RelationshipDto extends ElementDto {
  sourceId: string;
  targetId: string;
}

export interface ViewNodeDto {
  id: string;
  kind: 'element' | 'container' | 'label';
  elementId?: string;
  conceptRef?: string;
  xpathPart?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  style?: StyleDto;
  nodes: ViewNodeDto[];
}

export interface ViewConnectionDto {
  id: string;
  kind: 'relationship' | 'line';
  relationshipId?: string;
  sourceId?: string;
  targetId?: string;
  waypoints: PointDto[];
  label?: string;
  style?: StyleDto;
}

export interface ViewDto {
  id: string;
  name?: string;
  nodes: ViewNodeDto[];
  connections: ViewConnectionDto[];
}

export interface ModelDto {
  schemaVersion: 1;
  id: string;
  name?: string;
  elements: ElementDto[];
  relationships: RelationshipDto[];
  views: ViewDto[];
  diagnostics: DtoDiagnostic[];
}
