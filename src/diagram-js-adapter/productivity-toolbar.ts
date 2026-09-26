import type { Alignment, DistributionAxis } from '../modeler/productivity.js';

interface DiagramJsToolbarModeler {
  get(serviceName: string): unknown;
}

interface CanvasService {
  getContainer(): HTMLElement;
}

interface EventBusService {
  on(event: string, listener: (event: unknown) => void): void;
  off(event: string, listener: (event: unknown) => void): void;
}

export interface ProductivityActions {
  duplicate(offset?: { x: number; y: number }): void;
  align(alignment: Alignment): void;
  distribute(axis: DistributionAxis): void;
  deleteSelection(): void;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.setAttribute('aria-label', label);
  item.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return item;
}

export function attachProductivityToolbar(modeler: DiagramJsToolbarModeler,
  actions: ProductivityActions): () => void {
  const canvas = modeler.get('canvas') as CanvasService;
  const eventBus = modeler.get('eventBus') as EventBusService;
  const host = canvas.getContainer();
  const toolbar = document.createElement('div');
  toolbar.className = 'am-context-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Selection actions');
  toolbar.hidden = true;
  Object.assign(toolbar.style, {
    position: 'absolute', right: '12px', top: '12px', zIndex: '1000',
    display: 'none', flexWrap: 'wrap', gap: '4px', maxWidth: '520px',
    padding: '6px', border: '1px solid #8b929a', borderRadius: '6px',
    background: 'var(--am-ui-surface, #fff)', color: 'var(--am-ui-text, #202124)'
  });
  const alignments: Alignment[] = ['left', 'center', 'right', 'top', 'middle', 'bottom'];
  const distributions: DistributionAxis[] = ['horizontal', 'vertical'];
  toolbar.append(button('Duplicate', () => actions.duplicate()));
  alignments.forEach((value) => toolbar.append(button(`Align ${value}`, () => actions.align(value))));
  distributions.forEach((value) =>
    toolbar.append(button(`Distribute ${value}`, () => actions.distribute(value))));
  toolbar.append(button('Delete selection', actions.deleteSelection));
  host.append(toolbar);
  const onSelection = (event: unknown): void => {
    const selection = event && typeof event === 'object' &&
      Array.isArray((event as { newSelection?: unknown }).newSelection) ?
      (event as { newSelection: unknown[] }).newSelection : [];
    toolbar.hidden = selection.length === 0;
    toolbar.style.display = toolbar.hidden ? 'none' : 'flex';
  };
  eventBus.on('selection.changed', onSelection);
  return () => {
    eventBus.off('selection.changed', onSelection);
    toolbar.remove();
  };
}
