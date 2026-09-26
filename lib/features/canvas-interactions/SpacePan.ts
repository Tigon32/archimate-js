type Canvas = { scroll(delta: { dx: number; dy: number }): unknown };
type EventBus = {
  on(event: string, listener: (event: { svg?: SVGSVGElement }) => void): void;
};

type PanPoint = { x: number; y: number };

export default class SpacePan {
  static $inject = [ 'eventBus', 'canvas' ];

  private svg?: SVGSVGElement;
  private spacePressed = false;
  private panStart?: PanPoint;
  private readonly canvas: Canvas;

  constructor(eventBus: EventBus, canvas: Canvas) {
    this.canvas = canvas;
    eventBus.on('canvas.init', this.attach);
    eventBus.on('diagram.destroy', this.detach);
  }

  private readonly attach = (event: { svg?: SVGSVGElement }): void => {
    if (!event.svg) return;
    this.svg = event.svg;
    this.svg.addEventListener('mousedown', this.onMouseDown, true);
    this.svg.addEventListener('keydown', this.onKeyDown, true);
    this.svg.addEventListener('keyup', this.onKeyUp, true);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.spacePressed || event.button !== 0 || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.panStart = { x: event.clientX, y: event.clientY };
    document.addEventListener('mousemove', this.onMouseMove, true);
    document.addEventListener('mouseup', this.onMouseUp, true);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.panStart) return;
    this.canvas.scroll({
      dx: event.clientX - this.panStart.x,
      dy: event.clientY - this.panStart.y
    });
    this.panStart = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  };

  private readonly onMouseUp = (): void => {
    this.stopPan();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!isSpace(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!isEditableTarget(event.target)) this.spacePressed = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!isSpace(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.spacePressed = false;
    this.stopPan();
  };

  private stopPan(): void {
    this.panStart = undefined;
    document.removeEventListener('mousemove', this.onMouseMove, true);
    document.removeEventListener('mouseup', this.onMouseUp, true);
  }

  private detach = (): void => {
    this.stopPan();
    this.spacePressed = false;
    this.svg?.removeEventListener('mousedown', this.onMouseDown, true);
    this.svg?.removeEventListener('keydown', this.onKeyDown, true);
    this.svg?.removeEventListener('keyup', this.onKeyUp, true);
    this.svg = undefined;
  };
}

function isSpace(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' ' || event.key === 'Space';
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .djs-direct-editing-content'));
}
