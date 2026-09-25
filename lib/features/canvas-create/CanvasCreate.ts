import { delegate as domDelegate } from 'min-dom';
import { assign } from 'min-dash';
import { toPoint } from 'diagram-js/lib/util/Event';

// @ts-expect-error Legacy module has no declaration during incremental migration.
import { ARCHIMATE_NODE } from '../../metamodel/Concept';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import { isAny } from '../../util/ModelUtil';
// @ts-expect-error Legacy module has no declaration during incremental migration.
import { logger } from '../../util/Logger';

type Shape = {
  type: string;
  businessObject?: { $instanceOf?: (type: string) => boolean };
  $instanceOf?: (type: string) => boolean;
};
type Canvas = {
  getRootElement(): unknown;
};
type DirectEditing = {
  activate(element: Shape): void;
};
type ElementFactory = {
  create(type: 'shape', attributes: Record<string, unknown>): Shape;
};
type EventBus = {
  on(event: string, callback: (context: any) => void): void;
};
type Modeling = {
  createShape(shape: Shape, position: { x: number; y: number }, root: unknown): Shape;
};
type Delegate = {
  bind(
    target: SVGSVGElement,
    selector: string,
    type: string,
    callback: (event: Event) => void
  ): EventListener;
  unbind(target: SVGSVGElement, type: string, callback: EventListener): void;
};

const DEFAULT_SHAPE: Shape = {
  type: 'archimate:',
  $instanceOf: () => true
} as Shape;

export default function CanvasCreate(
  eventBus: EventBus,
  elementFactory: ElementFactory,
  canvas: Canvas,
  directEditing: DirectEditing,
  modeling: Modeling
): void {
  let lastCreatedShape = DEFAULT_SHAPE;

  function createShapeOnCanvas(event: Event): void {
    const position = toPoint(event);
    if (!position) return;
    const newShape = elementFactory.create('shape', assign(lastCreatedShape, position));
    logger.log('_createShapeOnCanvas(event)');
    logger.log(newShape);
    const createdShape = modeling.createShape(newShape, position, canvas.getRootElement());
    if (isAny(createdShape.businessObject, [ ARCHIMATE_NODE ])) {
      directEditing.activate(createdShape);
    }
  }

  function saveLastCreatedShape(shape?: Shape): void {
    if (!shape) {
      lastCreatedShape = DEFAULT_SHAPE;
      return;
    }
    const viewElement = shape.businessObject;
    lastCreatedShape = {
      type: shape.type,
      $instanceOf: (type: string) =>
        typeof viewElement?.$instanceOf === 'function' && viewElement.$instanceOf(type)
    };
  }

  eventBus.on('canvas.init', ({ svg }: { svg: SVGSVGElement }) => {
    const delegate = domDelegate as unknown as Delegate;
    const handler = delegate.bind(svg, 'svg', 'dblclick', (event: Event) => {
      if (event.target === svg) createShapeOnCanvas(event);
    });
    eventBus.on('diagram.destroy', () => {
      delegate.unbind(svg, 'dblclick', handler);
    });
    eventBus.on('create.end', ({ shape }: { shape?: Shape }) => {
      saveLastCreatedShape(shape);
    });
  });
}

CanvasCreate.$inject = [ 'eventBus', 'elementFactory', 'canvas', 'directEditing', 'modeling' ];
