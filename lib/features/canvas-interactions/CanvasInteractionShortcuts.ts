type CanvasViewbox = { x: number; y: number; width: number; height: number; scale: number };
type DiagramElement = { id?: string };
type CanvasService = {
  zoom(value?: number | 'fit-viewport'): number;
  viewbox(box?: { x: number; y: number; width: number; height: number }): CanvasViewbox;
  scrollToElement(element: DiagramElement | DiagramElement[], padding?: number): void;
  resized?(): void;
};
type SelectionService = { get(): DiagramElement[]; select(elements: DiagramElement[] | null): void };
type EditorActions = {
  register(action: string, listener: (opts?: unknown) => unknown): void;
  isRegistered(action: string): boolean;
  trigger(action: string, opts?: unknown): unknown;
};
type EventBus = { on(event: string, priority: number, listener: (event: unknown) => void): void };
type Keyboard = {
  addListener(priority: number, listener: (context: { keyEvent: KeyboardEvent }) => unknown): void;
  isCmd(event: KeyboardEvent): boolean;
  isKey(keys: string | string[], event: KeyboardEvent): boolean;
};

const SHORTCUT_PRIORITY = 1600;

export default function CanvasInteractionShortcuts(
  eventBus: EventBus,
  keyboard: Keyboard,
  canvas: CanvasService,
  selection: SelectionService
): void {
  eventBus.on('editorActions.init', 1000, (event) => {
    const editorActions = (event as { editorActions?: EditorActions }).editorActions;
    if (!editorActions) return;
    registerViewportActions(editorActions, canvas, selection);
    registerKeyboardShortcuts(keyboard, editorActions);
  });
}

CanvasInteractionShortcuts.$inject = [
  'eventBus',
  'keyboard',
  'canvas',
  'selection'
];

function registerViewportActions(
  editorActions: EditorActions,
  canvas: CanvasService,
  selection: SelectionService
): void {
  registerOnce(editorActions, 'fitView', () => {
    canvas.resized?.();
    return canvas.zoom('fit-viewport');
  });
  registerOnce(editorActions, 'fitSelection', () => {
    const selected = selection.get();
    if (!selected.length) return editorActions.trigger('fitView');
    canvas.scrollToElement(selected, 100);
    return canvas.zoom();
  });
  registerOnce(editorActions, 'clearSelection', () => {
    selection.select(null);
  });
}

function registerOnce(editorActions: EditorActions, action: string, listener: () => unknown): void {
  if (!editorActions.isRegistered(action)) editorActions.register(action, listener);
}

function registerKeyboardShortcuts(keyboard: Keyboard, editorActions: EditorActions): void {
  keyboard.addListener(SHORTCUT_PRIORITY, ({ keyEvent }) => {
    if (isEditableTarget(keyEvent.target)) return undefined;
    if (keyboard.isKey('Escape', keyEvent)) return trigger(editorActions, 'clearSelection');
    if (keyboard.isCmd(keyEvent) && keyboard.isKey('0', keyEvent)) return trigger(editorActions, 'fitView');
    if (keyEvent.shiftKey && !hasCommandModifier(keyEvent) && keyboard.isKey([ '1', '!' ], keyEvent)) {
      return trigger(editorActions, 'fitView');
    }
    if (keyEvent.shiftKey && !hasCommandModifier(keyEvent) && keyboard.isKey([ '2', '@' ], keyEvent)) {
      return trigger(editorActions, 'fitSelection');
    }
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .djs-direct-editing-content'));
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

function trigger(editorActions: EditorActions, action: string): boolean | undefined {
  if (!editorActions.isRegistered(action)) return undefined;
  editorActions.trigger(action);
  return true;
}
