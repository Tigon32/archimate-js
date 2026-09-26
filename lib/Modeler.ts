// @ts-expect-error Legacy module has no declaration during incremental migration.
import BaseModeler from './BaseModeler';
import Viewer from './Viewer';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import NavigatedViewer from './NavigatedViewer';
import AlignElementsModule from 'diagram-js/lib/features/align-elements';
import AutoScrollModule from 'diagram-js/lib/features/auto-scroll';
import BendpointsModule from 'diagram-js/lib/features/bendpoints';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import CanvasCreate from './features/canvas-create';
import ConnectModule from 'diagram-js/lib/features/connect';
import ConnectionPreviewModule from 'diagram-js/lib/features/connection-preview';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import ContextPadModule from './features/context-pad';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import CopyPasteModule from './features/copy-paste';
import CreateModule from 'diagram-js/lib/features/create';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import EditorActionsModule from './features/editor-actions';
import CanvasInteractionsModule from './features/canvas-interactions';
import HandToolModule from 'diagram-js/lib/features/hand-tool';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import KeyboardModule from './features/keyboard';
import KeyboardMoveSelectionModule from 'diagram-js/lib/features/keyboard-move-selection';
import LassoToolModule from 'diagram-js/lib/features/lasso-tool';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import LabelEditingModule from './features/label-editing';
import MoveModule from 'diagram-js/lib/features/move';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import PaletteModule from './features/palette';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import ReplacePreviewModule from './features/replace-preview';
import ResizeModule from 'diagram-js/lib/features/resize';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import SnappingModule from './features/snapping';
import { optimizeDiagram } from './layout/optimize-diagram.mjs';
import type { OptimizerOutput, OptimizerView } from '../src/layout/adapter.js';

type Module = unknown;
type ModelerConstructor = ((this: ModelerInstance, options?: unknown) => void) & {
  super_: unknown;
  Viewer: typeof Viewer;
  NavigatedViewer: typeof NavigatedViewer;
  prototype: ModelerPrototype;
};
type BaseModelerCallable = { call(instance: object, options?: unknown): void };
type CanvasElement = {
  id: string;
  x: number;
  y: number;
  label?: { x: number; y: number };
};
type ElementRegistry = { get(id: string): CanvasElement | undefined };
type Canvas = { getRootElement(): { businessObject: unknown } };
type CommandStack = { execute(command: string, context: unknown): void };
type ModelerInstance = {
  importXML(xml: string, viewIndex?: number, createDefaultView?: boolean): Promise<unknown>;
  get(service: 'canvas'): Canvas;
  get(service: 'elementRegistry'): ElementRegistry;
  get(service: 'commandStack'): CommandStack;
};
type ModelerPrototype = ModelerInstance & {
  createNewModel(): Promise<unknown>;
  optimizeDiagram(options?: unknown): { patch: unknown; metrics: unknown };
  _modelingModules: Module[];
  _modules: Module[];
};

const runOptimizer = optimizeDiagram as unknown as
  (view: OptimizerView, options?: unknown) => OptimizerOutput;

const templateModel = `<?xml version="1.0" encoding="UTF-8"?>
<archimate:Model xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:archimate="http://www.opengroup.org/xsd/archimate/3.0/" xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd">
  <name>New model</name>
  <documentation></documentation>
  <archimate:Elements>
  </archimate:Elements>
  <archimate:Views>
    <archimate:Diagrams>
      <archimate:View>
        <name>Default View</name>
        <documentation></documentation>
      </archimate:View>
    </archimate:Diagrams>
  </archimate:Views>
  <archimate:PropertyDefinitions>
  </archimate:PropertyDefinitions>
</archimate:Model>`;

const Modeler = function(this: ModelerInstance, options?: unknown): void {
  (BaseModeler as unknown as BaseModelerCallable).call(this, options);
} as ModelerConstructor;

Modeler.super_ = BaseModeler;
Modeler.prototype = Object.create(BaseModeler.prototype, {
  constructor: { value: Modeler, enumerable: false, writable: true, configurable: true }
});

Modeler.Viewer = Viewer;
Modeler.NavigatedViewer = NavigatedViewer;

Modeler.prototype.createNewModel = function(): Promise<unknown> {
  return this.importXML(templateModel, 0, true);
};

Modeler.prototype.optimizeDiagram = function(options?: unknown): { patch: unknown; metrics: unknown } {
  const root = this.get('canvas').getRootElement();
  const result = runOptimizer(root.businessObject as OptimizerView, options);
  const registry = this.get('elementRegistry');
  const context = {
    nodes: result.patch.nodes.map((entry) => {
      const element = registry.get(entry.id);
      if (!element) throw new Error('Node is absent from the current canvas');
      return {
        ...entry,
        element,
        elementBefore: { x: element.x, y: element.y },
        labelBefore: element.label && { x: element.label.x, y: element.label.y }
      };
    }),
    connections: result.patch.connections.map((entry) => {
      const element = registry.get(entry.id);
      if (!element) throw new Error('Connection is absent from the current canvas');
      return {
        ...entry,
        element,
        labelBefore: element.label && { x: element.label.x, y: element.label.y }
      };
    })
  };
  this.get('commandStack').execute('diagram.optimize', context);
  return { patch: result.patch, metrics: result.metrics };
};

Modeler.prototype._modelingModules = [
  AlignElementsModule,
  AutoScrollModule,
  BendpointsModule,
  CanvasCreate,
  ConnectModule,
  ConnectionPreviewModule,
  ContextPadModule,
  CopyPasteModule,
  CreateModule,
  EditorActionsModule,
  CanvasInteractionsModule,
  HandToolModule,
  KeyboardModule,
  KeyboardMoveSelectionModule,
  LassoToolModule,
  LabelEditingModule,
  MoveModule,
  PaletteModule,
  ReplacePreviewModule,
  ResizeModule,
  SnappingModule
];

Modeler.prototype._modules = [
  ...(Viewer.prototype._modules || []),
  ...Modeler.prototype._modelingModules
];

export default Modeler;
