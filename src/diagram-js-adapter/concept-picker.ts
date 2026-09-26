import {
  ConceptPicker,
  type ConceptPickerEditor,
  type ConceptPickerPosition
} from '../../lib/features/concept-picker/ConceptPicker.js';
import { CONCEPT_REGISTRY } from '../language/concept-registry.mjs';
import type { EditorCommand } from '../model-dto/editor.js';
import type { ModelDto } from '../model-dto/types.js';

type Canvas = {
  getContainer(): HTMLElement;
  viewbox(): { x: number; y: number; scale: number };
};

type DirectEditing = {
  isActive(): boolean;
  activate(element: unknown): boolean;
};

type ElementRegistry = {
  get(id: string): unknown;
};

export interface DiagramJsConceptPickerServices {
  get(serviceName: string): unknown;
}

export interface ConceptPickerEditorService {
  createId: ConceptPickerEditor['createId'];
  execute(command: EditorCommand): void;
  startNameEditing(nodeId: string): void;
}

export interface ConceptPickerAdapterOptions {
  modeler: DiagramJsConceptPickerServices;
  editor: ConceptPickerEditorService;
  viewId: string;
}

export function attachConceptPicker(options: ConceptPickerAdapterOptions): () => void {
  const canvas = options.modeler.get('canvas') as Canvas;
  const svg = canvas.getContainer().querySelector('svg');
  if (!svg) throw new Error('MODELER_CANVAS_UNAVAILABLE');
  const directEditing = options.modeler.get('directEditing') as DirectEditing;
  const elementRegistry = options.modeler.get('elementRegistry') as ElementRegistry;
  let picker: ConceptPicker | undefined;

  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.djs-element') ||
        target.closest('input, textarea, select, [contenteditable="true"]') ||
        directEditing.isActive()) return;
    event.preventDefault();
    event.stopPropagation();
    picker?.close();
    const client = { x: event.clientX, y: event.clientY };
    picker = new ConceptPicker({
      viewId: options.viewId,
      position: clientToDiagram(canvas, svg, client),
      anchor: client,
      returnFocus: svg,
      registry: CONCEPT_REGISTRY,
      editor: {
        createId: options.editor.createId,
        execute: (command) => options.editor.execute(command),
        startNameEditing: (nodeId) => {
          const shape = elementRegistry.get(nodeId);
          if (!shape) throw new Error('MODELER_CREATED_NODE_UNAVAILABLE');
          if (!directEditing.activate(shape)) throw new Error('MODELER_NAME_EDIT_UNAVAILABLE');
          options.editor.startNameEditing(nodeId);
        }
      }
    });
  };

  svg.addEventListener('dblclick', onDoubleClick);
  return () => {
    svg.removeEventListener('dblclick', onDoubleClick);
    picker?.close();
    picker = undefined;
  };
}

function clientToDiagram(canvas: Canvas, svg: SVGSVGElement,
  point: ConceptPickerPosition): ConceptPickerPosition {
  const viewbox = canvas.viewbox();
  const bounds = svg.getBoundingClientRect();
  return {
    x: viewbox.x + (point.x - bounds.left) / viewbox.scale,
    y: viewbox.y + (point.y - bounds.top) / viewbox.scale
  };
}
