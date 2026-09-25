interface SelectionEvent {
  type: 'changed' | 'selection';
  viewId: string;
  selectedIds: string[];
}

interface DiagramAdapterSelectionApi {
  project(viewId: string): { selectedIds: string[] };
  select(viewId: string, ids: string[]): void;
  subscribe(listener: (event: SelectionEvent) => void): () => void;
}

export interface DiagramAdapterSelectionBridge {
  onSelectionChange(callback: (ids: string[]) => void): () => void;
  selectById(id: string): boolean;
  clearSelection(): void;
  dispose(): void;
}

/** Keep the outline on the DTO adapter's stable, ID-only selection contract. */
export function createDiagramAdapterSelectionBridge(editor: DiagramAdapterSelectionApi,
  viewId: string): DiagramAdapterSelectionBridge {
  const callbacks = new Set<(ids: string[]) => void>();
  let disposed = false;
  const unsubscribe = editor.subscribe((event) => {
    if (disposed || event.type !== 'selection' || event.viewId !== viewId) return;
    for (const callback of callbacks) callback([...event.selectedIds]);
  });

  return {
    onSelectionChange(callback) {
      if (disposed) return () => {};
      callbacks.add(callback);
      callback([...editor.project(viewId).selectedIds]);
      return () => callbacks.delete(callback);
    },
    selectById(id) {
      if (disposed) return false;
      editor.select(viewId, [id]);
      return true;
    },
    clearSelection() {
      if (!disposed) editor.select(viewId, []);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      callbacks.clear();
      unsubscribe();
    }
  };
}
