// SYNTHETIC: Uses only the checked-in public-safe MEFF fixture.
import { expect, it } from 'vitest';
// @ts-expect-error Existing MEFF parser is legacy JavaScript pending incremental migration.
import { parseMeffModel } from '../../lib/import/MeffModel.js';
// @ts-expect-error Existing MEFF view parser is legacy JavaScript pending incremental migration.
import { parseMeffViews } from '../../lib/import/MeffView.js';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  parseModelDto, projectImportedModelDto, serializeModelDto, validateModelDto
} from '../../src/model-dto/index.js';

function importedFixture() {
  const xml = readFileSync('test/fixtures/meff-schema/valid-view-presentation.xml', 'utf8');
  const parsed = parseMeffModel(xml, { create: (_type: string, attrs: object = {}) => ({ ...attrs }) });
  const views = parseMeffViews(xml, parsed.rootElement);
  parsed.rootElement.views = views.views;
  parsed.diagnostics.push(...views.diagnostics);
  return parsed;
}

it('projects semantic refs, presentation variants, and authored styles', () => {
  const imported = importedFixture();
  const dto = projectImportedModelDto(imported);
  expect(dto.id).toBe('model-synthetic-presentation');
  expect(dto.relationships[0]).toMatchObject({ sourceId: 'component-one', targetId: 'service-two' });
  expect(dto.views[0].nodes[0]).toMatchObject({ kind: 'element', elementId: 'component-one',
    style: { stroke: '#14283C80', fill: '#B4D2F000', lineWidth: 7 } });
  expect(dto.views[0].nodes[2]).toMatchObject({ kind: 'container', id: 'container-one',
    nodes: [{ kind: 'label', id: 'label-one', label: 'Presentation-only note' }] });
  expect(dto.views[0].connections[0]).toMatchObject({ kind: 'relationship',
    relationshipId: 'serving-one-two' });
  expect(dto.views[0].connections[0].waypoints.map((point) => point.kind)).toEqual([
    'sourceAttachment', 'bendpoint', 'bendpoint', 'targetAttachment'
  ]);
  expect(dto.views[0].connections[1]).toMatchObject({ kind: 'line', sourceId: 'container-one',
    targetId: 'label-one' });
  expect(dto.views[0].connections[2]).toMatchObject({ kind: 'line', sourceId: undefined,
    targetId: undefined, waypoints: [{ kind: 'bendpoint' }, { kind: 'bendpoint' }] });
});

it('round-trips the projected DTO deterministically without parser internals', () => {
  const dto = projectImportedModelDto(importedFixture());
  const json = serializeModelDto(dto);
  expect(parseModelDto(json)).toEqual(dto);
  expect(serializeModelDto(parseModelDto(json))).toBe(json);
  expect(json).not.toContain('elementsById');
  expect(json).not.toContain('archimate:Node');
});

it('keeps supported records when an unsupported field is present and emits content-free diagnostics', () => {
  const imported = importedFixture();
  imported.rootElement.metadata = { syntheticMarker: 'sensitive-test-value' };
  const dto = projectImportedModelDto(imported);
  expect(dto.elements).toHaveLength(2);
  expect(dto.diagnostics.map((entry) => entry.code)).toContain('DTO_UNSUPPORTED_FIELDS');
  expect(JSON.stringify(dto)).not.toContain('sensitive-test-value');

  delete imported.rootElement.metadata;
  imported.rootElement.views.diagrams.viewsList[0].viewElements[0].nodes[0].meffProperties =
    [{ value: 'synthetic-nested-private-value' }];
  const nested = projectImportedModelDto(imported);
  expect(nested.diagnostics.map((entry) => entry.code)).toContain('DTO_UNSUPPORTED_FIELDS');
  expect(JSON.stringify(nested)).not.toContain('synthetic-nested-private-value');

  imported.rootElement.views.diagrams.viewsList[0].viewElements.push({
    $type: 'archimate:Unknown', id: 'synthetic-unsupported-record', x: 0, y: 0, w: 10, h: 10
  });
  const unsupported = projectImportedModelDto(imported);
  expect(unsupported.views[0].nodes.map((node) => node.id)).not.toContain('synthetic-unsupported-record');
  expect(unsupported.diagnostics.map((entry) => entry.code)).toContain('DTO_UNSUPPORTED_FIELDS');
});

it('rejects invalid references, geometry, duplicate IDs, and short paths at the unknown boundary', () => {
  const dto = projectImportedModelDto(importedFixture());
  const change = (edit: (data: typeof dto) => void) => {
    const data = structuredClone(dto);
    edit(data);
    expect(() => validateModelDto(data)).toThrow('The model DTO is invalid.');
  };
  change((data) => { data.elements[1].id = data.elements[0].id; });
  change((data) => { data.relationships[0].sourceId = 'missing'; });
  change((data) => { data.views[0].nodes[0].width = Infinity; });
  change((data) => { data.views[0].connections[0].waypoints = [{ x: 1, y: 2 }]; });
  expect(() => projectImportedModelDto(null)).toThrow('The model DTO is invalid.');
  expect(() => parseModelDto('{bad json')).toThrow('The model DTO is invalid.');
});

it('allows relationship-to-relationship semantic endpoints without changing diagram node refs', () => {
  const dto = projectImportedModelDto(importedFixture());
  dto.relationships.push({ id: 'association-two', type: 'archimate:Association',
    sourceId: dto.relationships[0].id, targetId: dto.elements[0].id });
  expect(validateModelDto(dto).relationships[1].sourceId).toBe('serving-one-two');
});
