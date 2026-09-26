/** @vitest-environment jsdom */
// SYNTHETIC: Exercises public registry records and synthetic editor callbacks only.
import { expect, it } from 'vitest';
import {
  ConceptPicker, clampPickerPosition, conceptLabel, createConceptCommand, searchConcepts
} from '../../src/modeler/concept-picker.js';
import { CONCEPT_REGISTRY } from '../../src/language/concept-registry.mjs';

const layers = [
  'Business', 'Application', 'Technology', 'Strategy', 'Motivation', 'Physical',
  'Implementation & Migration'
];

it('derives every picker option from the registry and covers each requested layer', () => {
  const options = searchConcepts('', CONCEPT_REGISTRY);
  expect(options).toHaveLength(CONCEPT_REGISTRY.records.length);
  for (const layer of layers) {
    expect(options.some((option) => option.layer === layer)).toBe(true);
  }
  expect(options.every((option) => option.record === CONCEPT_REGISTRY.byType.get(option.type))).toBe(true);
});

it('searches presentation label, canonical type, and layer without using renderer keys', () => {
  expect(searchConcepts('business service', CONCEPT_REGISTRY).map((option) => option.type)).toEqual(['BusinessService']);
  expect(searchConcepts('ApplicationComponent', CONCEPT_REGISTRY).map((option) => option.type))
    .toEqual(['ApplicationComponent']);
  expect(searchConcepts('implementation & migration', CONCEPT_REGISTRY).map((option) => option.layer))
    .toEqual(expect.arrayContaining(['Implementation & Migration']));
  expect(conceptLabel({ type: 'ValueStream' })).toBe('Value Stream');
});

it('clamps picker placement inside the viewport while preserving room for its size', () => {
  expect(clampPickerPosition({ x: 780, y: 750 }, { width: 360, height: 300 },
    { width: 1024, height: 768 })).toEqual({ x: 652, y: 456 });
  expect(clampPickerPosition({ x: 30, y: 45 }, { width: 360, height: 300 },
    { width: 1024, height: 768 })).toEqual({ x: 30, y: 45 });
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
    registry: CONCEPT_REGISTRY,
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
    registry: CONCEPT_REGISTRY,
    editor: { createId: () => 'unused', execute: () => {}, startNameEditing: () => {} }
  });
  const escapeInput = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  escapeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  void picker;
  void escapePicker;
});

it('keeps background focus and pointer interaction inside the modal', () => {
  const background = document.createElement('button');
  const clicked: string[] = [];
  background.addEventListener('click', () => clicked.push('background'));
  background.addEventListener('pointerdown', () => clicked.push('pointerdown'));
  document.body.append(background);
  const picker = new ConceptPicker({
    viewId: 'view-synthetic', position: { x: 0, y: 0 },
    registry: CONCEPT_REGISTRY,
    editor: { createId: () => 'unused', execute: () => {}, startNameEditing: () => {} }
  });
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  background.focus();
  expect(document.activeElement).toBe(input);
  background.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  background.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  background.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(clicked).toEqual([]);
  expect(document.activeElement).toBe(input);
  picker.close();
});

it('replaces an already-open picker in the same document without competing focus traps', () => {
  const editor = { createId: () => 'unused', execute: () => {}, startNameEditing: () => {} };
  const first = new ConceptPicker({
    viewId: 'view-synthetic', position: { x: 10, y: 20 }, anchor: { x: 10, y: 20 },
    registry: CONCEPT_REGISTRY, editor
  });
  const second = new ConceptPicker({
    viewId: 'view-synthetic', position: { x: 30, y: 40 }, anchor: { x: 30, y: 40 },
    registry: CONCEPT_REGISTRY, editor
  });
  const dialogs = document.querySelectorAll('[role="dialog"]');
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]?.getAttribute('aria-modal')).toBe('true');
  expect((dialogs[0] as HTMLElement).style.left).toBe('30px');
  expect(document.activeElement).toBe(dialogs[0]?.querySelector('input'));
  first.close();
  expect(document.querySelector('[role="dialog"]')).toBe(dialogs[0]);
  second.close();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
