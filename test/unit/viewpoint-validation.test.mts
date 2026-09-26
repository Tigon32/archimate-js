// SYNTHETIC: hand-authored DTO/profile values exercise the caller-owned rule boundary.
import { expect, it } from 'vitest';
import { validateViewpoint } from '../../src/model-dto/index.js';
import type { ModelDto } from '../../src/model-dto/index.js';
import type { ViewpointValidationProfile, ViewpointValidationRequest } from '../../src/model-dto/index.js';

function syntheticModel(): ModelDto {
  return { schemaVersion: 1, id: 'model-synthetic', elements: [
    { id: 'element-synthetic', type: 'archimate:BusinessActor', name: 'Synthetic actor' }
  ], relationships: [], views: [{ id: 'view-synthetic', nodes: [{
    id: 'node-synthetic', kind: 'element', elementId: 'element-synthetic',
    x: 0, y: 0, width: 100, height: 60, nodes: []
  }], connections: [] }], diagnostics: [] };
}

function syntheticProfile(): ViewpointValidationProfile {
  return { id: 'profile.synthetic-review', support: 'supported',
    viewpointIds: ['viewpoint.synthetic'], rules: [{ code: 'REQUIRE_COMPONENT',
      kind: 'require-element-type', elementType: 'archimate:ApplicationComponent',
      severity: 'warning', actionText: 'Add a component to this synthetic view or revise the profile.' }] };
}

function request(model = syntheticModel(), profile = syntheticProfile()): ViewpointValidationRequest {
  return { model, viewId: 'view-synthetic', viewpointId: 'viewpoint.synthetic',
    profileId: profile.id, profiles: [profile] };
}

it('reports deterministic profile findings with safe IDs and action text', () => {
  const input = request();
  const before = structuredClone(input);
  const result = validateViewpoint(input);
  expect(result).toEqual({ status: 'validated', profileCode: 'profile.synthetic-review',
    viewId: 'view-synthetic', viewpointId: 'viewpoint.synthetic', findings: [{
      code: 'VIEWPOINT_REQUIRE_COMPONENT', profileCode: 'profile.synthetic-review',
      ruleCode: 'REQUIRE_COMPONENT', viewId: 'view-synthetic', viewpointId: 'viewpoint.synthetic',
      affectedDtoIds: ['view-synthetic'], severity: 'warning',
      actionText: 'Add a component to this synthetic view or revise the profile.'
    }] });
  expect(input).toEqual(before);
});

it('returns no findings when the selected view satisfies its supported profile', () => {
  const model = syntheticModel();
  model.elements[0].type = 'archimate:ApplicationComponent';
  expect(validateViewpoint(request(model))).toMatchObject({ status: 'validated', findings: [] });
});

it('keeps unknown profiles, unsupported profiles, and unknown viewpoints explicit', () => {
  const input = request();
  expect(validateViewpoint({ ...input, profileId: 'profile.missing' })).toMatchObject({
    status: 'unsupported', code: 'VIEWPOINT_PROFILE_UNKNOWN', findings: []
  });
  const unsupported = { ...syntheticProfile(), support: 'unsupported' as const };
  expect(validateViewpoint(request(syntheticModel(), unsupported))).toMatchObject({
    status: 'unsupported', code: 'VIEWPOINT_PROFILE_UNSUPPORTED', findings: []
  });
  expect(validateViewpoint({ ...input, viewpointId: 'viewpoint.missing' })).toMatchObject({
    status: 'unsupported', code: 'VIEWPOINT_UNSUPPORTED', findings: []
  });
});

it('reports excluded DTO node IDs in deterministic order', () => {
  const model = syntheticModel();
  model.views[0].nodes.push({ id: 'node-synthetic-2', kind: 'element',
    elementId: 'element-synthetic', x: 20, y: 30, width: 100, height: 60, nodes: [] });
  const profile = { ...syntheticProfile(), rules: [{ code: 'EXCLUDE_ACTOR',
    kind: 'exclude-element-type' as const, elementType: 'archimate:BusinessActor',
    severity: 'error' as const, actionText: 'Review the excluded synthetic node.' }] };
  expect(validateViewpoint(request(model, profile))).toMatchObject({
    status: 'validated', findings: [{ code: 'VIEWPOINT_EXCLUDE_ACTOR',
      affectedDtoIds: ['node-synthetic', 'node-synthetic-2'], severity: 'error' }]
  });
});

it('returns bounded invalid-input results for invalid DTOs and profile contracts', () => {
  const model = syntheticModel();
  model.views[0].nodes[0].elementId = 'missing-element';
  expect(validateViewpoint(request(model))).toEqual({
    status: 'invalid', code: 'VIEWPOINT_MODEL_INVALID', findings: []
  });
  expect(validateViewpoint({ ...request(), profileId: 'bad profile' })).toEqual({
    status: 'invalid', code: 'VIEWPOINT_INPUT_INVALID', findings: []
  });
});
