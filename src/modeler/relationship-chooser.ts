import {
  RELATIONSHIP_SEMANTIC_ROWS,
  validateRelationshipSemantics,
  type RelationshipSemanticResult
} from '../language/relationship-semantics.mjs';
import type { ConceptRecord, ConceptRegistry } from '../language/concept-registry.mjs';

export interface RelationshipCandidate {
  type: string;
  label: string;
  decision: RelationshipSemanticResult;
}

export interface RelationshipChoice {
  sourceType: string;
  targetType: string;
  candidates: readonly RelationshipCandidate[];
  allowed: readonly RelationshipCandidate[];
  disallowed: readonly RelationshipCandidate[];
  unsupported: readonly RelationshipCandidate[];
  status: 'default' | 'chooser' | 'feedback';
}

export interface QuickCreateCandidate {
  concept: ConceptRecord;
  relationship: RelationshipCandidate;
}

export type RelationshipDecisionValidator = typeof validateRelationshipSemantics;

const relationshipTypes = Object.freeze([...new Set(
  RELATIONSHIP_SEMANTIC_ROWS.map((row) => row.relationshipType.replace(/Relationship$/, ''))
)]);

export function relationshipLabel(type: string): string {
  return type.replace(/Relationship$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function evaluateRelationshipChoices(
  sourceType: string,
  targetType: string,
  types: readonly string[] = relationshipTypes,
  validator: RelationshipDecisionValidator = validateRelationshipSemantics
): RelationshipChoice {
  const candidates = types.map((type) => ({
    type,
    label: relationshipLabel(type),
    decision: validator({ sourceType, relationshipType: type, targetType })
  }));
  const allowed = candidates.filter((candidate) => candidate.decision.decision === 'allowed');
  const disallowed = candidates.filter((candidate) => candidate.decision.decision === 'disallowed');
  const unsupported = candidates.filter((candidate) => candidate.decision.decision === 'unsupported');
  return {
    sourceType,
    targetType,
    candidates,
    allowed,
    disallowed,
    unsupported,
    status: allowed.length === 1 ? 'default' : allowed.length > 1 ? 'chooser' : 'feedback'
  };
}

export function quickCreateCandidates(
  sourceType: string,
  registry: ConceptRegistry,
  types: readonly string[] = relationshipTypes
): QuickCreateCandidate[] {
  return registry.records
    .filter((concept) => concept.category === 'element')
    .flatMap((concept) => {
      const choices = evaluateRelationshipChoices(sourceType, concept.type, types);
      return choices.allowed.map((relationship) => ({ concept, relationship }));
    })
    .sort((left, right) => left.concept.layer.localeCompare(right.concept.layer) ||
      left.concept.type.localeCompare(right.concept.type) ||
      left.relationship.type.localeCompare(right.relationship.type));
}

export interface RelationshipChooserOptions {
  choice: RelationshipChoice;
  onChoose: (candidate: RelationshipCandidate) => void;
  onCancel?: () => void;
  anchor?: { x: number; y: number };
  returnFocus?: { focus(): void } | null;
}

export class RelationshipChooser {
  private readonly dialog = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly list = document.createElement('ul');
  private readonly status = document.createElement('p');
  private readonly returnFocus: { focus(): void } | null;
  private selectedIndex = 0;
  private closed = false;

  constructor(private readonly options: RelationshipChooserOptions) {
    this.returnFocus = options.returnFocus ?? document.activeElement as { focus(): void } | null;
    this.configure();
    document.body.append(this.dialog);
    this.render();
    this.input.focus();
  }

  close(cancel = true): void {
    if (this.closed) return;
    this.closed = true;
    this.dialog.remove();
    this.returnFocus?.focus();
    if (cancel) this.options.onCancel?.();
  }

  private configure(): void {
    const title = document.createElement('h2');
    title.id = 'am-relationship-chooser-title';
    title.textContent = 'Choose relationship';
    this.dialog.className = 'am-relationship-chooser';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', title.id);
    Object.assign(this.dialog.style, {
      position: 'fixed', zIndex: '10001', width: 'min(360px, calc(100vw - 24px))',
      padding: '16px', border: '1px solid #8b929a', borderRadius: '8px',
      background: '#fff', color: '#202124', boxShadow: '0 8px 28px rgb(0 0 0 / 24%)'
    });
    if (this.options.anchor) {
      this.dialog.style.left = `${this.options.anchor.x}px`;
      this.dialog.style.top = `${this.options.anchor.y}px`;
    }
    this.input.type = 'search';
    this.input.setAttribute('aria-label', 'Filter relationships');
    this.input.setAttribute('aria-controls', 'am-relationship-chooser-options');
    this.list.id = 'am-relationship-chooser-options';
    this.list.setAttribute('role', 'listbox');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.dialog.append(title, this.direction(), this.input, this.status, this.list);
    this.input.addEventListener('input', () => this.render());
    this.input.addEventListener('keydown', (event) => this.keydown(event));
  }

  private direction(): HTMLParagraphElement {
    const direction = document.createElement('p');
    direction.textContent = `${this.options.choice.sourceType} \u2192 ${this.options.choice.targetType}`;
    direction.setAttribute('aria-label', 'Relationship direction');
    return direction;
  }

  private render(): void {
    const needle = this.input.value.trim().toLowerCase();
    const results = this.options.choice.allowed.filter((candidate) =>
      !needle || candidate.label.toLowerCase().includes(needle) ||
      candidate.type.toLowerCase().includes(needle));
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, results.length - 1));
    this.status.textContent = results.length ? `${results.length} relationship types available` :
      `${this.options.choice.disallowed.length} known disallowed; ` +
      `${this.options.choice.unsupported.length} unsupported for this direction`;
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
