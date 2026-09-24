// SYNTHETIC: Uses hand-authored public-safe MEFF fixtures only.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  exportModelDtoToMeff, importMeffToModelDto, serializeModelDto
} from '../../src/model-dto/index.js';

const fixture = (name: string) => readFileSync(`test/fixtures/synthetic/${name}`, 'utf8');
const schemaFixture = (name: string) => readFileSync(`test/fixtures/meff-schema/${name}`, 'utf8');
const model = () => importMeffToModelDto(fixture('dto-export-view.xml'));

it.each(['dto-export-model.xml', 'dto-export-view.xml'])(
  'retains the supported DTO through MEFF import/export/import: %s', (name) => {
    const dto = importMeffToModelDto(fixture(name));
    expect(dto.diagnostics).toEqual([]);
    const xml = exportModelDtoToMeff(dto);
    expect(serializeModelDto(importMeffToModelDto(xml))).toBe(serializeModelDto(dto));
    expect(exportModelDtoToMeff(importMeffToModelDto(xml))).toBe(xml);
  }
);

it('rejects imported omitted fields and localization rather than emitting an incomplete model', () => {
  for (const name of ['valid-model.xml', 'valid-view-presentation.xml']) {
    const dto = importMeffToModelDto(schemaFixture(name));
    expect(dto.diagnostics.length).toBeGreaterThan(0);
    expect(() => exportModelDtoToMeff(dto)).toThrow('Unable to export the ArchiMate model DTO as MEFF.');
  }
});

it('rejects unsupported diagram and relationship variants and noncanonical geometry', () => {
  const change = (edit: (data: ReturnType<typeof model>) => void) => {
    const dto = structuredClone(model());
    edit(dto);
    expect(() => exportModelDtoToMeff(dto)).toThrow('Unable to export the ArchiMate model DTO as MEFF.');
  };
  change((dto) => { dto.views[0].nodes[0].kind = 'container'; delete dto.views[0].nodes[0].elementId; });
  change((dto) => { dto.views[0].connections[0].kind = 'line';
    delete dto.views[0].connections[0].relationshipId; });
  change((dto) => { dto.relationships.push({ id: 'next-relation', type: 'archimate:Association',
    sourceId: 'serving-one-two', targetId: 'component-one' }); });
  change((dto) => { dto.views[0].nodes[0].x = 20.5; });
  change((dto) => { dto.views[0].connections[0].waypoints[0].kind = 'bendpoint'; });
  change((dto) => { dto.views[0].nodes[0].style!.stroke = '#14283C7F'; });
});

it('rejects unknown source fields without reflecting them in error messages', () => {
  const dto = model();
  const privateValue = 'synthetic-private-field';
  const input: unknown = { ...dto, extra: privateValue };
  try {
    exportModelDtoToMeff(input);
    throw new Error('Expected export rejection.');
  } catch (error) {
    expect(error).toMatchObject({ code: 'MEFF_DTO_EXPORT_INVALID',
      message: 'Unable to export the ArchiMate model DTO as MEFF.' });
    expect(String(error)).not.toContain(privateValue);
  }
});
