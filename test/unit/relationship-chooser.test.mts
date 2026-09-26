/** @vitest-environment jsdom */
// SYNTHETIC: Relationship pairs come from the reviewed public subset or explicit synthetic validators.
import { expect, it } from 'vitest';
import {
  QuickCreateChooser,
  RelationshipChooser,
  evaluateRelationshipChoices,
  quickCreateCandidates
} from '../../src/modeler/relationship-chooser.js';

it('defaults only for one allowed relationship and preserves unsupported candidates', () => {
  const choice = evaluateRelationshipChoices('ApplicationComponent', 'ApplicationFunction');
  expect(choice.status).toBe('default');
  expect(choice.allowed.map(({ type }) => type)).toEqual(['Assignment']);
  expect(choice.unsupported.some(({ type }) => type === 'Serving')).toBe(true);
});

it('offers every allowed relationship without converting unsupported choices into invalid ones', () => {
  const choice = evaluateRelationshipChoices('ApplicationProcess', 'ApplicationProcess');
  expect(choice.status).toBe('chooser');
  expect(choice.allowed.map(({ type }) => type)).toEqual(['Flow', 'Triggering']);
});

it('reports disallowed-only endpoints separately from unsupported endpoint pairs', () => {
  const disallowed = evaluateRelationshipChoices('DataObject', 'ApplicationFunction');
  expect(disallowed.disallowed.some(({ type }) => type === 'Access')).toBe(true);

  const unsupported = evaluateRelationshipChoices('BusinessActor', 'TechnologyService');
  expect(unsupported.allowed).toEqual([]);
  expect(unsupported.unsupported.length).toBeGreaterThan(0);
});

it('supports accessible keyboard choice, direction, cancellation, and focus restoration', () => {
  const returnFocus = document.createElement('button');
  document.body.append(returnFocus);
  returnFocus.focus();
  const selected: string[] = [];
  const chooser = new RelationshipChooser({
    choice: evaluateRelationshipChoices('ApplicationProcess', 'ApplicationProcess'),
    returnFocus,
    onChoose: (candidate) => selected.push(candidate.type)
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-labelledby')).toBe('am-relationship-chooser-title');
  expect(dialog.textContent).toContain('ApplicationProcess → ApplicationProcess');
  expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(2);
  dialog.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true
  }));
  expect(selected).toEqual(['Flow']);
  expect(document.activeElement).toBe(returnFocus);
  chooser.close();

  let canceled = false;
  new RelationshipChooser({
    choice: evaluateRelationshipChoices('ApplicationProcess', 'ApplicationProcess'),
    returnFocus,
    onChoose: () => {},
    onCancel: () => { canceled = true; }
  });
  document.querySelector<HTMLElement>('[role="dialog"] input')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(canceled).toBe(true);
});

it('shows explicit feedback without offering a type when no reviewed option is allowed', () => {
  const choice = evaluateRelationshipChoices('BusinessActor', 'TechnologyService');
  new RelationshipChooser({ choice, onChoose: () => {} });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(0);
  expect(dialog.textContent).toContain('unsupported by the reviewed profile');
  expect(dialog.querySelector('button')?.textContent).toBe('Close');
});

it('shows explicit disallowed and unsupported counts instead of treating them as equivalent', () => {
  const choice = evaluateRelationshipChoices('DataObject', 'ApplicationFunction');
  new RelationshipChooser({ choice, onChoose: () => {} });
  const status = document.querySelector('[role="status"]')!;
  expect(status.textContent).toContain('1 explicitly disallowed');
  expect(status.textContent).toMatch(/\d+ unsupported by the reviewed profile/);
});

it('offers only allowed semantic quick-create pairs and supports cancellation', () => {
  const candidates = quickCreateCandidates('ApplicationProcess');
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every(({ relationship }) => relationship.decision.decision === 'allowed')).toBe(true);
  expect(candidates.some(({ concept, relationship }) =>
    concept.type === 'ApplicationProcess' && relationship.type === 'Flow')).toBe(true);
  let chosen = false;
  let canceled = false;
  new QuickCreateChooser({
    sourceType: 'ApplicationProcess',
    candidates,
    onChoose: () => { chosen = true; },
    onCancel: () => { canceled = true; }
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-labelledby')).toBe('am-quick-create-title');
  expect(dialog.querySelectorAll('[role="option"]').length).toBe(candidates.length);
  dialog.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true
  }));
  expect(chosen).toBe(false);
  expect(canceled).toBe(true);
});
