export interface ViewerSelectionAdapter {
  onSelectionChange(callback: (ids: string[]) => void): () => void;
  selectById(id: string): boolean;
  clearSelection(): void;
  dispose(): void;
}

interface DiagramElement {
  id: string;
}

interface ElementRegistry {
  get(id: string): DiagramElement | undefined;
}

interface SelectionService {
  get(): DiagramElement[];
  select(element: DiagramElement | DiagramElement[] | null): void;
}

interface ViewerWithServices {
  get(name: 'elementRegistry'): ElementRegistry;
  get(name: 'selection'): SelectionService;
  on(event: string, callback: (event?: unknown) => void): void;
  off(event: string, callback: (event?: unknown) => void): void;
  destroy?: () => void;
}

function hasServices(value: unknown): value is ViewerWithServices {
  return Boolean(value && typeof value === 'object' &&
    typeof (value as { get?: unknown }).get === 'function' &&
    typeof (value as { on?: unknown }).on === 'function' &&
    typeof (value as { off?: unknown }).off === 'function');
}

function selectedIds(selection: SelectionService): string[] {
  return selection.get().map((element) => element.id).filter(Boolean);
}

export function createViewerSelectionAdapter(viewer: unknown): ViewerSelectionAdapter | undefined {
  if (!hasServices(viewer)) return undefined;
  const selection = viewer.get('selection');
  const registry = viewer.get('elementRegistry');
  if (!selection || !registry) return undefined;
  const disposers: Array<() => void> = [];
  const callbacks = new Set<(ids: string[]) => void>();
  let disposed = false;

  const notify = (): void => {
    if (!disposed) callbacks.forEach((callback) => callback(selectedIds(selection)));
  };
  const clearAndNotify = (): void => {
    if (disposed) return;
    selection.select(null);
    notify();
  };
  viewer.on('selection.changed', notify);
  viewer.on('import.render.start', clearAndNotify);
  disposers.push(() => viewer.off('selection.changed', notify),
    () => viewer.off('import.render.start', clearAndNotify));

  const originalDestroy = typeof viewer.destroy === 'function' ? viewer.destroy.bind(viewer) : undefined;
  if (originalDestroy) {
    viewer.destroy = () => {
      adapter.dispose();
      originalDestroy();
    };
  }

  const adapter: ViewerSelectionAdapter = {
    onSelectionChange(callback) {
      callbacks.add(callback);
      callback(selectedIds(selection));
      return () => callbacks.delete(callback);
    },
    selectById(id) {
      if (disposed) return false;
      const element = registry.get(id);
      if (!element) return false;
      selection.select(element);
      notify();
      return true;
    },
    clearSelection() {
      clearAndNotify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      callbacks.clear();
      while (disposers.length) disposers.pop()?.();
    }
  };
  return adapter;
}
