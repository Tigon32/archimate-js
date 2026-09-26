// SYNTHETIC: hand-authored DTOs and profiles; no catalog, specification table, or private model is bundled.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import {
  createViewpointAdvisoryService, DiagramAdapter, importMeffToModelDto
} from '../../src/model-dto/index.js';
import type {
  EditorCommand, ModelDto, ViewpointValidationProfile
} from '../../src/model-dto/index.js';

const fixture = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
const viewId = 'view-dto-export';
const viewpointId = 'viewpoint.synthetic';

function model(): ModelDto {
  return importMeffToModelDto(fixture);
}

function profile(rule: ViewpointValidationProfile['rules'][number],
  support: ViewpointValidationProfile['support'] = 'supported'): ViewpointValidationProfile {
  return { id: 'profile.synthetic-advisory', support, viewpointIds: [viewpointId], rules: [rule] };
}

function requireComponent(): ViewpointValidationProfile {
  return profile({ code: 'REQUIRE_COMPONENT', kind: 'require-element-type',
    elementType: 'archimate:ApplicationComponent', severity: 'warning',
    actionText: 'Add a synthetic component to this view.' });
}

function requireActor(): ViewpointValidationProfile {
  return profile({ code: 'REQUIRE_ACTOR', kind: 'require-element-type',
    elementType: 'archimate:BusinessActor', severity: 'warning',
    actionText: 'Keep a synthetic actor in this view.' });
}

function excludeComponent(): ViewpointValidationProfile {
  return profile({ code: 'EXCLUDE_COMPONENT', kind: 'exclude-element-type',
    elementType: 'archimate:ApplicationComponent', severity: 'error',
    actionText: 'Remove synthetic components from this profile.' });
}

function excludeActor(): ViewpointValidationProfile {
  return profile({ code: 'EXCLUDE_ACTOR', kind: 'exclude-element-type',
    elementType: 'archimate:BusinessActor', severity: 'error',
    actionText: 'Remove synthetic actors from this profile.' });
}

function createActorCommand(): EditorCommand {
  return { type: 'create-element', viewId,
    element: { id: 'actor-one', type: 'archimate:BusinessActor',
      name: 'Synthetic actor' },
    node: { id: 'node-actor', kind: 'element', elementId: 'actor-one',
      x: 120, y: 0, width: 120, height: 60, nodes: [] } };
}

it('reports no findings for a satisfied explicit profile', () => {
  const service = createViewpointAdvisoryService({
    adapter: new DiagramAdapter(model()), viewId, viewpointId, profile: requireComponent()
  });
  expect(service.getSnapshot()).toMatchObject({
    mode: 'advisory', status: 'validated', profileCode: 'profile.synthetic-advisory',
    viewId, viewpointId, findings: [], blocking: false
  });
});

it('exposes deterministic advisory findings with profile, rule, affected concepts, severity, and text', () => {
  const service = createViewpointAdvisoryService({
    adapter: new DiagramAdapter(model()), viewId, viewpointId, profile: excludeComponent()
  });
  expect(service.getSnapshot().findings).toEqual([{
    code: 'VIEWPOINT_EXCLUDE_COMPONENT', profileCode: 'profile.synthetic-advisory',
    ruleCode: 'EXCLUDE_COMPONENT', viewId, viewpointId, affectedDtoIds: ['node-component'],
    affectedConceptIds: ['component-one'], severity: 'error',
    actionText: 'Remove synthetic components from this profile.'
  }]);
});

it('re-validates after a changed event for the selected view', () => {
  const adapter = new DiagramAdapter(model());
  const service = createViewpointAdvisoryService({
    adapter, viewId, viewpointId, profile: requireActor()
  });
  const snapshots: string[] = [];
  service.subscribe((snapshot) => { snapshots.push(snapshot.findings.length.toString()); });
  service.execute(createActorCommand());
  expect(service.getSnapshot().findings).toEqual([]);
  expect(snapshots).toEqual(['0']);
});

it('keeps unresolved viewpoints explicit without findings', () => {
  const service = createViewpointAdvisoryService({
    adapter: new DiagramAdapter(model()), viewId, viewpointId: 'viewpoint.missing',
    profile: requireActor()
  });
  expect(service.getSnapshot()).toMatchObject({
    status: 'unsupported', code: 'VIEWPOINT_UNSUPPORTED', findings: [], blocking: false
  });
});

it('keeps unsupported caller profiles explicit without findings', () => {
  const service = createViewpointAdvisoryService({
    adapter: new DiagramAdapter(model()), viewId, viewpointId,
    profile: profile(requireActor().rules[0], 'unsupported')
  });
  expect(service.getSnapshot()).toMatchObject({
    status: 'unsupported', code: 'VIEWPOINT_PROFILE_UNSUPPORTED', findings: [], blocking: false
  });
});

it('does not block edits or persistence in default advisory mode when findings exist', () => {
  const adapter = new DiagramAdapter(model());
  const service = createViewpointAdvisoryService({
    adapter, viewId, viewpointId, profile: excludeComponent()
  });
  const before = adapter.serialize();
  const result = service.execute({ type: 'label', viewId, itemId: 'node-component',
    label: 'Changed synthetic label' });
  expect(result.status).toBe('applied');
  expect(adapter.serialize()).not.toBe(before);
  expect(adapter.exportOperationLog('synthetic-client').operations).toHaveLength(1);
});

it('reports strict blocking without mutating the adapter', () => {
  const adapter = new DiagramAdapter(model());
  const service = createViewpointAdvisoryService({
    adapter, viewId, viewpointId, profile: excludeActor(), strict: true
  });
  const before = adapter.serialize();
  const result = service.execute(createActorCommand());
  expect(result).toMatchObject({ status: 'blocked',
    snapshot: { blocking: true, findings: [{ ruleCode: 'EXCLUDE_ACTOR',
      affectedConceptIds: ['actor-one'] }] } });
  expect(adapter.serialize()).toBe(before);
  expect(adapter.undo()).toBe(false);
});

it('does not mutate caller input', () => {
  const adapter = new DiagramAdapter(model());
  const syntheticProfile = excludeActor();
  const command: EditorCommand = { type: 'label', viewId, itemId: 'node-component',
    label: 'Changed synthetic label' };
  const profileBefore = structuredClone(syntheticProfile);
  const commandBefore = structuredClone(command);
  const service = createViewpointAdvisoryService({
    adapter, viewId, viewpointId, profile: syntheticProfile
  });
  service.execute(command);
  expect(syntheticProfile).toEqual(profileBefore);
  expect(command).toEqual(commandBefore);
});

it('stops re-validation after disposal', () => {
  const adapter = new DiagramAdapter(model());
  const service = createViewpointAdvisoryService({
    adapter, viewId, viewpointId, profile: requireActor()
  });
  const before = service.getSnapshot();
  service.dispose();
  adapter.execute(createActorCommand());
  expect(service.getSnapshot()).toEqual(before);
});
