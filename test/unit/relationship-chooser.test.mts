/** @vitest-environment jsdom */
// SYNTHETIC: Uses public registry records and synthetic relationship types only.
import { expect, it } from 'vitest';
import {
  RelationshipChooser,
  evaluateRelationshipChoices,
  quickCreateCandidates
} from '../../src/modeler/relationship-chooser.js';
import { CONCEPT_REGISTRY, createConceptRegistry } from '../../src/language/concept-registry.mjs';

it('defaults only when exactly one reviewed candidate is allowed', () => {
  expect(evaluateRelationshipChoices('ApplicationComponent', 'ApplicationFunction',
    ['Assignment', 'Serving'])).toMatchObject({
      status: 'default',
      allowed: [{ type: 'Assignment' }],
      unsupported: [{ type: 'Serving' }]
    });
  expect(evaluateRelationshipChoices('ApplicationFunction', 'ApplicationComponent',
    ['Assignment', 'Serving'])).toMatchObject({ status: 'feedback', allowed: [] });
});

it('keeps multiple allowed choices, direction, and tri-state results explicit', () => {
  const choice = evaluateRelationshipChoices('SyntheticSource', 'SyntheticTarget',
    ['Flow', 'Serving', 'Assignment'], ({ relationshipType }) => ({
      archimateVersion: '3.2',
      decision: relationshipType === 'Flow' || relationshipType === 'Serving' ? 'allowed' :
        relationshipType === 'Assignment' ? 'disallowed' : 'unsupported',
      reasonCode: relationshipType === 'Assignment' ? 'MATRIX_DISALLOWED' : 'COMBINATION_UNSUPPORTED'
    }));
  expect(choice.status).toBe('chooser');
  expect(choice.sourceType).toBe('SyntheticSource');
  expect(choice.targetType).toBe('SyntheticTarget');
  expect(choice.allowed.map(({ type }) => type)).toEqual(['Flow', 'Serving']);
  expect(choice.disallowed.map(({ type }) => type)).toEqual(['Assignment']);
});

it('does not offer relationship endpoints as quick-create concepts', () => {
  const registry = createConceptRegistry([
    CONCEPT_REGISTRY.byType.get('ApplicationFunction')!,
    CONCEPT_REGISTRY.byType.get('ApplicationService')!
  ]);
  const candidates = quickCreateCandidates('ApplicationFunction', registry, ['Realization']);
  expect(candidates.map(({ concept }) => concept.type)).toEqual(['ApplicationService']);
});

it('supports keyboard selection, direction, accessible names, and Escape cancellation', () => {
  const returnFocus = document.createElement('button');
  document.body.append(returnFocus);
  returnFocus.focus();
  const selected: string[] = [];
  let cancelled = false;
  const choice = evaluateRelationshipChoices('ApplicationComponent', 'ApplicationFunction',
    ['Assignment', 'Serving']);
  const chooser = new RelationshipChooser({
    choice,
    returnFocus,
    onChoose: (candidate) => selected.push(candidate.type),
    onCancel: () => { cancelled = true; }
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-labelledby')).toBe('am-relationship-chooser-title');
  expect(dialog.textContent).toContain('ApplicationComponent \u2192 ApplicationFunction');
  const input = dialog.querySelector('input')!;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(selected).toEqual(['Assignment']);
  expect(document.activeElement).toBe(returnFocus);
  chooser.close();

  const escape = new RelationshipChooser({
    choice: evaluateRelationshipChoices('ApplicationComponent', 'ApplicationFunction', ['Assignment']),
    returnFocus,
    onChoose: () => {},
    onCancel: () => { cancelled = true; }
  });
  document.querySelector<HTMLElement>('[role="dialog"] input')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(cancelled).toBe(true);
  void escape;
});
