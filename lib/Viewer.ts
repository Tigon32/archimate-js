import CoreModule from './core';
import TranslateModule from 'diagram-js/lib/i18n/translate';
import OutlineModule from 'diagram-js/lib/features/outline';
import SelectionModule from 'diagram-js/lib/features/selection';
import OverlaysModule from 'diagram-js/lib/features/overlays';
import ModelingModule from './features/modeling';
import KeyboardMoveModule from 'diagram-js/lib/navigation/keyboard-move';
import MoveCanvasModule from 'diagram-js/lib/navigation/movecanvas';
import ZoomScrollModule from 'diagram-js/lib/navigation/zoomscroll';
import BaseViewer from './BaseViewer';

type Module = unknown;
type ViewerConstructor = ((this: object, options?: unknown) => void) & {
  super_?: unknown;
  prototype: {
    _interactionModules?: Module[];
    _coreModules?: Module[];
    _modules?: Module[];
    _moddleExtensions?: Record<string, unknown>;
  };
};
type BaseViewerCallable = { call(instance: object, options?: unknown): void };

const Viewer = function(this: object, options?: unknown): void {
  (BaseViewer as unknown as BaseViewerCallable).call(this, options);
} as ViewerConstructor;

Viewer.super_ = BaseViewer;
Viewer.prototype = Object.create(BaseViewer.prototype, {
  constructor: { value: Viewer, enumerable: false, writable: true, configurable: true }
});

Viewer.prototype._interactionModules = [
  KeyboardMoveModule,
  MoveCanvasModule,
  ZoomScrollModule
];

Viewer.prototype._coreModules = [
  CoreModule,
  TranslateModule,
  OutlineModule,
  SelectionModule,
  OverlaysModule,
  ModelingModule
];

Viewer.prototype._modules = [
  ...Viewer.prototype._coreModules,
  ...Viewer.prototype._interactionModules
];

Viewer.prototype._moddleExtensions = {};

export default Viewer;
