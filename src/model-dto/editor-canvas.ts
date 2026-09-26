import type { PointDto, StyleDto, ViewNodeDto } from './types.js';
import type { EditorCommand } from './editor.js';

/** The canvas receives values and identifiers, never mutable diagram-js objects. */
export interface CanvasProjection {
  viewId: string;
  nodes: Array<{ id: string; parentId?: string; elementId?: string; kind: ViewNodeDto['kind'];
    type?: string; name?: string; x: number; y: number; width: number; height: number;
    label?: string; style?: StyleDto }>;
  connections: Array<{ id: string; relationshipId?: string; sourceId?: string; targetId?: string;
    type?: string; name?: string; waypoints: PointDto[]; label?: string; style?: StyleDto }>;
  selectedIds: string[];
}

export interface CanvasPort {
  render(projection: CanvasProjection): void;
  onCommand(handler: (command: EditorCommand) => void): () => void;
  onSelection(handler: (ids: string[]) => void): () => void;
  clear?(): void;
}

export interface AttachedCanvas { viewId: string; offCommand: () => void; offSelection: () => void }
