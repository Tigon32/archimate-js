/** @vitest-environment jsdom */
// SYNTHETIC: Exercises public registry records and synthetic editor callbacks only.
import { expect, it } from 'vitest';
import {
  ConceptPicker, conceptLabel, createConceptCommand, searchConcepts
} from '../../lib/features/concept-picker/ConceptPicker.js';
import { CONCEPT_REGISTRY } from '../../src/language/concept-registry.mjs';

const layers = [
  'Business', 'Application', 'Technology', 'Strategy', 'Motivation', 'Physical',
  'Implementation & Migration'
];

it('derives every picker option from the registry and covers each requested layer', () => {
  const options = searchConcepts('');
  expect(options).toHaveLength(CONCEPT_REGISTRY.records.length);
  for (const layer of layers) {
    expect(options.some((option) => option.layer === layer)).toBe(true);
  }
  expect(options.every((option) => option.record === CONCEPT_REGISTRY.byType.get(option.type))).toBe(true);
});

it('searches presentation label, canonical type, and layer without using renderer keys', () => {
  expect(searchConcepts('business service').map((option) => option.type)).toEqual(['BusinessService']);
  expect(searchConcepts('ApplicationComponent').map((option) => option.type)).toEqual(['ApplicationComponent']);
  expect(searchConcepts('implementation & migration').map((option) => option.layer))
    .toEqual(expect.arrayContaining(['Implementation & Migration']));
  expect(conceptLabel({ type: 'ValueStream' })).toBe('Value Stream');
});

it('builds an exact DTO create command with caller-generated deterministic IDs', () => {
  const ids = ['element-synthetic-1', 'node-synthetic-1'];
  const command = createConceptCommand(CONCEPT_REGISTRY.byType.get('BusinessService')!,
    { x: 320, y: 180 }, 'view-synthetic', { createId: () => ids.shift()! });
  expect(command).toEqual({
    type: 'create-element', viewId: 'view-synthetic',
    element: { id: 'element-synthetic-1', type: 'archimate:BusinessService' },
    node: { id: 'node-synthetic-1', kind: 'element', elementId: 'element-synthetic-1',
      x: 320, y: 180, width: 140, height: 70, nodes: [] }
  });
});

it('filters, navigates, creates, starts editing, and restores focus accessibly', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const commands: unknown[] = [];
  const edited: string[] = [];
  const picker = new ConceptPicker({
    viewId: 'view-synthetic',
    position: { x: 90, y: 120 },
    anchor: { x: 30, y: 45 },
    returnFocus: trigger,
    editor: {
      createId: (kind) => `${kind}-synthetic-1`,
      execute: (command) => commands.push(command),
      startNameEditing: (nodeId) => edited.push(nodeId)
    }
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const input = dialog.querySelector<HTMLInputElement>('input')!;
  expect(document.activeElement).toBe(input);
  expect(dialog.style.left).toBe('30px');
  expect(dialog.style.top).toBe('45px');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(document.activeElement).toBe(input);
  expect(dialog.querySelector('[role="status"]')?.textContent).toMatch(/\d+ concepts available/);
  input.value = 'Business Service';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(dialog.querySelectorAll('[role="option"]')).toHaveLength(1);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(commands).toHaveLength(1);
  expect(edited).toEqual(['node-synthetic-1']);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  const escapePicker = new ConceptPicker({
    viewId: 'view-synthetic', position: { x: 0, y: 0 }, returnFocus: trigger,
    editor: { createId: () => 'unused', execute: () => {}, startNameEditing: () => {} }
  });
  const escapeInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  escapeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  void picker;
  void escapePicker;
});
