import {
  RELATIONSHIP_SEMANTIC_ROWS,
  validateRelationshipSemantics,
  type RelationshipSemanticResult
} from '../language/relationship-semantics.mjs';
import type { SemanticProfile } from '../language/semantic-profile.mjs';
import { CONCEPT_REGISTRY, type ConceptRecord } from '../language/concept-registry.mjs';

export interface RelationshipCandidate {
  type: string;
  label: string;
  decision: RelationshipSemanticResult;
}

export interface RelationshipChoice {
  sourceType: string;
  targetType: string;
  allowed: readonly RelationshipCandidate[];
  disallowed: readonly RelationshipCandidate[];
  unsupported: readonly RelationshipCandidate[];
  status: 'default' | 'chooser' | 'feedback';
}

export interface QuickCreateCandidate {
  concept: ConceptRecord;
  relationship: RelationshipCandidate;
}

const relationshipTypes = Object.freeze([...new Set(
  RELATIONSHIP_SEMANTIC_ROWS.map((row) => row.relationshipType.replace(/Relationship$/, ''))
)]);

export function relationshipLabel(type: string): string {
  return type.replace(/Relationship$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function evaluateRelationshipChoices(sourceType: string, targetType: string,
  semanticProfile?: SemanticProfile): RelationshipChoice {
  const candidates = relationshipTypes.map((type) => ({
    type,
    label: relationshipLabel(type),
    decision: validateRelationshipSemantics({ sourceType, relationshipType: type, targetType },
      semanticProfile)
  }));
  const allowed = candidates.filter((candidate) => candidate.decision.decision === 'allowed');
  return {
    sourceType,
    targetType,
    allowed,
    disallowed: candidates.filter((candidate) => candidate.decision.decision === 'disallowed'),
    unsupported: candidates.filter((candidate) => candidate.decision.decision === 'unsupported'),
    status: allowed.length === 1 ? 'default' : allowed.length > 1 ? 'chooser' : 'feedback'
  };
}

export function quickCreateCandidates(sourceType: string,
  semanticProfile?: SemanticProfile): QuickCreateCandidate[] {
  return CONCEPT_REGISTRY.records.flatMap((concept) =>
    evaluateRelationshipChoices(sourceType, concept.type, semanticProfile).allowed.map((relationship) =>
      ({ concept, relationship })))
    .sort((left, right) => left.concept.layer.localeCompare(right.concept.layer) ||
      left.concept.type.localeCompare(right.concept.type) ||
      left.relationship.type.localeCompare(right.relationship.type));
}

export interface RelationshipChooserOptions {
  choice: RelationshipChoice;
  onChoose: (candidate: RelationshipCandidate) => void;
  onCancel?: () => void;
  returnFocus?: { focus(): void } | null;
}

export interface QuickCreateChooserOptions {
  sourceType: string;
  candidates: readonly QuickCreateCandidate[];
  onChoose(candidate: QuickCreateCandidate): void;
  onCancel?: () => void;
  returnFocus?: { focus(): void } | null;
}

function dialogElement(titleText: string, titleId: string, width: string): HTMLDivElement {
  const dialog = document.createElement('div');
  const title = document.createElement('h2');
  title.id = titleId;
  title.textContent = titleText;
  dialog.className = 'am-relationship-chooser';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  Object.assign(dialog.style, {
    position: 'fixed', zIndex: '10001', width,
    padding: '16px', border: '1px solid #8b929a', borderRadius: '8px',
    background: '#fff', color: '#202124', boxShadow: '0 8px 28px rgb(0 0 0 / 24%)',
    left: '50%', top: '50%', transform: 'translate(-50%, -50%)'
  });
  dialog.append(title);
  return dialog;
}

function createSearchInput(label: string, listId: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'search';
  input.setAttribute('aria-label', label);
  input.setAttribute('aria-controls', listId);
  return input;
}

function createOptionList(id: string): HTMLUListElement {
  const list = document.createElement('ul');
  list.id = id;
  list.setAttribute('role', 'listbox');
  return list;
}

function createStatus(): HTMLParagraphElement {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  return status;
}

function closeButton(onClose: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Close';
  button.addEventListener('click', onClose);
  return button;
}

interface ActiveDialog {
  close(cancel?: boolean): void;
}

let activeDialog: ActiveDialog | undefined;

export class RelationshipChooser {
  private readonly dialog = dialogElement('Choose relationship', 'am-relationship-chooser-title',
    'min(360px, calc(100vw - 24px))');
  private readonly input = createSearchInput('Filter relationships', 'am-relationship-chooser-options');
  private readonly list = createOptionList('am-relationship-chooser-options');
  private readonly status = createStatus();
  private readonly returnFocus: { focus(): void } | null;
  private selectedIndex = 0;
  private closed = false;

  constructor(private readonly options: RelationshipChooserOptions) {
    this.returnFocus = options.returnFocus ?? document.activeElement as { focus(): void } | null;
    activeDialog?.close();
    activeDialog = this;
    const direction = document.createElement('p');
    direction.textContent = `${options.choice.sourceType} → ${options.choice.targetType}`;
    direction.setAttribute('aria-label', 'Relationship direction');
    this.dialog.append(direction);
    this.input.disabled = options.choice.status === 'feedback';
    this.dialog.append(this.input, this.status, this.list);
    if (options.choice.status === 'feedback') this.dialog.append(closeButton(() => this.close()));
    this.input.addEventListener('input', () => this.render());
    this.input.addEventListener('keydown', (event) => this.keydown(event));
    document.body.append(this.dialog);
    this.render();
    this.input.focus();
  }

  close(cancel = true): void {
    if (this.closed) return;
    this.closed = true;
    this.dialog.remove();
    if (activeDialog === this) activeDialog = undefined;
    this.returnFocus?.focus();
    if (cancel) this.options.onCancel?.();
  }

  private render(): void {
    if (this.options.choice.status === 'feedback') {
      const { disallowed, unsupported } = this.options.choice;
      this.status.textContent = `No relationship type is allowed. ${disallowed.length} explicitly disallowed; ` +
        `${unsupported.length} unsupported by the reviewed profile.`;
      this.list.replaceChildren();
      return;
    }
    const needle = this.input.value.trim().toLowerCase();
    const results = this.options.choice.allowed.filter((candidate) =>
      !needle || candidate.label.toLowerCase().includes(needle) ||
      candidate.type.toLowerCase().includes(needle));
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, results.length - 1));
    this.status.textContent = `${results.length} permitted relationship types available`;
    this.list.replaceChildren(...results.map((candidate, index) => {
      const option = document.createElement('li');
      option.id = `am-relationship-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === this.selectedIndex));
      option.tabIndex = -1;
      option.textContent = candidate.label;
      option.addEventListener('click', () => {
        this.options.onChoose(candidate);
        this.close(false);
      });
      return option;
    }));
    this.input.setAttribute('aria-activedescendant',
      results.length ? `am-relationship-option-${this.selectedIndex}` : '');
  }

  private keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const change = event.key === 'ArrowDown' ? 1 : -1;
      const count = this.list.children.length;
      if (count) this.selectedIndex = (this.selectedIndex + change + count) % count;
      this.render();
    } else if (event.key === 'Enter' && this.list.children.length) {
      event.preventDefault();
      (this.list.children[this.selectedIndex] as HTMLElement).click();
    }
  }
}

export class QuickCreateChooser {
  private readonly dialog = dialogElement('Create connected concept', 'am-quick-create-title',
    'min(420px, calc(100vw - 24px))');
  private readonly input = createSearchInput('Search compatible concepts', 'am-quick-create-options');
  private readonly list = createOptionList('am-quick-create-options');
  private readonly status = createStatus();
  private readonly returnFocus: { focus(): void } | null;
  private selectedIndex = 0;
  private closed = false;

  constructor(private readonly options: QuickCreateChooserOptions) {
    this.returnFocus = options.returnFocus ?? document.activeElement as { focus(): void } | null;
    activeDialog?.close();
    activeDialog = this;
    const direction = document.createElement('p');
    direction.textContent = `${options.sourceType} → compatible target`;
    direction.setAttribute('aria-label', 'Relationship direction');
    this.dialog.append(direction);
    this.input.disabled = !options.candidates.length;
    this.dialog.append(this.input, this.status, this.list);
    if (!options.candidates.length) this.dialog.append(closeButton(() => this.close()));
    this.input.addEventListener('input', () => this.render());
    this.input.addEventListener('keydown', (event) => this.keydown(event));
    document.body.append(this.dialog);
    this.render();
    if (options.candidates.length) this.input.focus();
    else this.dialog.querySelector('button')?.focus();
  }

  close(cancel = true): void {
    if (this.closed) return;
    this.closed = true;
    this.dialog.remove();
    if (activeDialog === this) activeDialog = undefined;
    this.returnFocus?.focus();
    if (cancel) this.options.onCancel?.();
  }

  private render(): void {
    const needle = this.input.value.trim().toLowerCase();
    const results = this.options.candidates.filter(({ concept, relationship }) =>
      !needle || [concept.type, concept.layer, relationship.label]
        .some((value) => value.toLowerCase().includes(needle)));
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, results.length - 1));
    this.status.textContent = results.length ?
      `${results.length} compatible concept and relationship choices` :
      'No compatible reviewed target concepts. Unsupported combinations are not assumed valid.';
    this.list.replaceChildren(...results.map(({ concept, relationship }, index) => {
      const option = document.createElement('li');
      option.id = `am-quick-create-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === this.selectedIndex));
      option.tabIndex = -1;
      option.textContent = `${relationshipLabel(concept.type)} (${concept.layer}) — ${relationship.label}`;
      option.addEventListener('click', () => {
        this.options.onChoose({ concept, relationship });
        this.close(false);
      });
      return option;
    }));
    this.input.setAttribute('aria-activedescendant',
      results.length ? `am-quick-create-option-${this.selectedIndex}` : '');
  }

  private keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const change = event.key === 'ArrowDown' ? 1 : -1;
      const count = this.list.children.length;
      if (count) this.selectedIndex = (this.selectedIndex + change + count) % count;
      this.render();
    } else if (event.key === 'Enter' && this.list.children.length) {
      event.preventDefault();
      (this.list.children[this.selectedIndex] as HTMLElement).click();
    }
  }
}
