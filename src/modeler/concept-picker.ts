import type { ConceptRecord, ConceptRegistry } from '../language/concept-registry.mjs';

export interface ConceptPickerPosition {
  x: number;
  y: number;
}

export interface CreateElementCommand {
  type: 'create-element';
  viewId: string;
  element: { id: string; type: string; name?: string };
  node: {
    id: string;
    kind: 'element';
    elementId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    nodes: [];
  };
}

export interface ConceptPickerEditor {
  createId(kind: 'element' | 'node'): string;
  execute(command: CreateElementCommand): void;
  startNameEditing(nodeId: string): void;
}

export interface ConceptPickerOptions {
  anchor?: ConceptPickerPosition;
  editor: ConceptPickerEditor;
  position: ConceptPickerPosition;
  viewId: string;
  host?: HTMLElement;
  registry: ConceptRegistry;
  returnFocus?: FocusTarget | null;
}

interface FocusTarget { focus(): void }

export interface ConceptPickerResult {
  label: string;
  layer: string;
  type: string;
  record: ConceptRecord;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 70;

export function conceptLabel(record: Pick<ConceptRecord, 'type'>): string {
  return record.type.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function clampPickerPosition(
  anchor: ConceptPickerPosition,
  dialog: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 12
): ConceptPickerPosition {
  const maxX = Math.max(margin, viewport.width - dialog.width - margin);
  const maxY = Math.max(margin, viewport.height - dialog.height - margin);
  return {
    x: Math.min(Math.max(margin, anchor.x), maxX),
    y: Math.min(Math.max(margin, anchor.y), maxY)
  };
}

export function searchConcepts(query: string, registry: ConceptRegistry): ConceptPickerResult[] {
  const needle = query.trim().toLowerCase();
  return registry.records
    .filter((record) => record.category === 'element')
    .map((record) => ({ record, label: conceptLabel(record), type: record.type, layer: record.layer }))
    .filter((result) => !needle || [result.label, result.type, result.layer]
      .some((value) => value.toLowerCase().includes(needle)))
    .sort((left, right) => left.layer.localeCompare(right.layer) ||
      left.label.localeCompare(right.label) || left.type.localeCompare(right.type));
}

export function createConceptCommand(
  record: ConceptRecord,
  position: ConceptPickerPosition,
  viewId: string,
  editor: Pick<ConceptPickerEditor, 'createId'>
): CreateElementCommand {
  const elementId = editor.createId('element');
  const nodeId = editor.createId('node');
  return {
    type: 'create-element',
    viewId,
    element: { id: elementId, type: `archimate:${record.type}` },
    node: {
      id: nodeId,
      kind: 'element',
      elementId,
      x: position.x,
      y: position.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      nodes: []
    }
  };
}

export class ConceptPicker {
  private readonly editor: ConceptPickerEditor;
  private readonly anchor?: ConceptPickerPosition;
  private readonly position: ConceptPickerPosition;
  private readonly registry: ConceptRegistry;
  private readonly returnFocus: FocusTarget | null;
  private readonly viewId: string;
  private readonly dialog: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly resultsStatus: HTMLParagraphElement;
  private results: ConceptPickerResult[];
  private selectedIndex = 0;
  private readonly containFocus = (event: FocusEvent): void => {
    if (event.target instanceof Node && !this.dialog.contains(event.target)) this.input.focus();
  };
  private readonly preventBackgroundPointer = (event: Event): void => {
    if (event.target instanceof Node && !this.dialog.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      this.input.focus();
    }
  };

  constructor(options: ConceptPickerOptions) {
    this.anchor = options.anchor;
    this.editor = options.editor;
    this.position = options.position;
    this.registry = options.registry;
    this.returnFocus = options.returnFocus ?? document.activeElement as FocusTarget | null;
    this.viewId = options.viewId;
    this.results = searchConcepts('', this.registry);
    this.dialog = document.createElement('div');
    this.input = document.createElement('input');
    this.list = document.createElement('ul');
    this.resultsStatus = document.createElement('p');
    this.initialize(options.host ?? document.body);
  }

  close(): void {
    document.removeEventListener('focusin', this.containFocus, true);
    document.removeEventListener('pointerdown', this.preventBackgroundPointer, true);
    document.removeEventListener('mousedown', this.preventBackgroundPointer, true);
    document.removeEventListener('click', this.preventBackgroundPointer, true);
    this.dialog.remove();
    this.returnFocus?.focus();
  }

  private initialize(host: HTMLElement): void {
    this.configureDialog();
    this.configureInput();
    this.configureList();
    const title = document.createElement('h2');
    title.id = 'am-concept-picker-title';
    title.textContent = 'Create ArchiMate concept';
    const label = document.createElement('label');
    label.htmlFor = this.input.id;
    label.textContent = 'Search concepts';
    this.dialog.append(title, label, this.input, this.resultsStatus, this.list);
    host.append(this.dialog);
    if (this.anchor) {
      const bounds = this.dialog.getBoundingClientRect();
      const position = clampPickerPosition(this.anchor, {
        width: bounds.width,
        height: bounds.height
      }, {
        width: window.innerWidth,
        height: window.innerHeight
      });
      this.dialog.style.left = `${position.x}px`;
      this.dialog.style.top = `${position.y}px`;
    }
    this.bindEvents();
    this.renderResults();
    this.input.focus();
  }

  private configureDialog(): void {
    this.dialog.className = 'am-concept-picker';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'am-concept-picker-title');
    this.dialog.tabIndex = -1;
    Object.assign(this.dialog.style, {
      zIndex: '10000',
      boxSizing: 'border-box',
      width: 'min(360px, calc(100vw - 24px))',
      maxHeight: 'min(480px, calc(100vh - 24px))',
      overflow: 'auto',
      padding: '16px',
      border: '1px solid var(--am-color-border, #8b929a)',
      borderRadius: '8px',
      background: 'var(--am-color-surface, #fff)',
      color: 'var(--am-color-text, #202124)',
      boxShadow: '0 8px 28px rgb(0 0 0 / 24%)',
      font: '14px/1.4 system-ui, sans-serif'
    });
    if (this.anchor) {
      this.dialog.style.position = 'fixed';
      this.dialog.style.left = `${this.anchor.x}px`;
      this.dialog.style.top = `${this.anchor.y}px`;
    }
  }

  private configureInput(): void {
    this.input.id = 'am-concept-picker-search';
    this.input.type = 'search';
    this.input.autocomplete = 'off';
    Object.assign(this.input.style, {
      boxSizing: 'border-box',
      width: '100%',
      minHeight: '40px',
      padding: '8px 10px',
      border: '1px solid var(--am-color-border, #62676d)',
      borderRadius: '4px',
      background: 'var(--am-color-input, #fff)',
      color: 'inherit',
      outline: '2px solid transparent',
      outlineOffset: '2px',
      font: 'inherit'
    });
    this.input.addEventListener('focus', () => {
      this.input.style.outlineColor = '#005a9c';
    });
    this.input.addEventListener('blur', () => {
      this.input.style.outlineColor = 'transparent';
    });
    this.input.setAttribute('aria-controls', 'am-concept-picker-results');
    this.input.setAttribute('aria-activedescendant', 'am-concept-picker-option-0');
  }

  private configureList(): void {
    this.list.id = 'am-concept-picker-results';
    this.list.setAttribute('role', 'listbox');
    Object.assign(this.list.style, {
      listStyle: 'none',
      margin: '8px 0 0',
      padding: '0'
    });
    this.resultsStatus.setAttribute('aria-live', 'polite');
    this.resultsStatus.setAttribute('role', 'status');
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => this.updateResults());
    this.input.addEventListener('keydown', (event) => this.handleKeydown(event));
    this.dialog.addEventListener('keydown', (event) => this.trapFocus(event));
    document.addEventListener('focusin', this.containFocus, true);
    document.addEventListener('pointerdown', this.preventBackgroundPointer, true);
    document.addEventListener('mousedown', this.preventBackgroundPointer, true);
    document.addEventListener('click', this.preventBackgroundPointer, true);
  }

  private updateResults(): void {
    this.results = searchConcepts(this.input.value, this.registry);
    this.selectedIndex = 0;
    this.renderResults();
  }

  private renderResults(): void {
    this.list.replaceChildren();
    this.resultsStatus.textContent = `${this.results.length} concepts available`;
    this.results.forEach((result, index) => {
      const option = document.createElement('li');
      option.id = `am-concept-picker-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === this.selectedIndex));
      option.tabIndex = -1;
      option.textContent = `${result.label} (${result.layer})`;
      Object.assign(option.style, {
        padding: '8px',
        borderRadius: '4px',
        cursor: 'pointer'
      });
      if (index === this.selectedIndex) option.style.background = 'var(--am-color-selected, #e8f0fe)';
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => this.choose(index));
      this.list.append(option);
    });
    this.input.setAttribute('aria-activedescendant',
      this.results.length ? `am-concept-picker-option-${this.selectedIndex}` : '');
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.results.length) return;
      const change = event.key === 'ArrowDown' ? 1 : -1;
      this.selectedIndex = (this.selectedIndex + change + this.results.length) % this.results.length;
      this.renderResults();
      return;
    }
    if (event.key === 'Enter' && this.results.length) {
      event.preventDefault();
      this.choose(this.selectedIndex);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    this.input.focus();
  }

  private choose(index: number): void {
    const result = this.results[index];
    if (!result) return;
    const command = createConceptCommand(result.record, this.position, this.viewId, this.editor);
    this.editor.execute(command);
    this.close();
    this.editor.startNameEditing(command.node.id);
  }
}
