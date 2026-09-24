// SYNTHETIC: Only checked-in public-safe MEFF and hand-authored invalid input.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { importMeffToModelDto, parseModelDto, serializeModelDto } from '../../src/model-dto/index.js';

it('imports synthetic MEFF into a DTO and round-trips JSON without parser objects', () => {
  const xml = readFileSync('test/fixtures/meff-schema/valid-view-presentation.xml', 'utf8');
  const dto = importMeffToModelDto(xml);
  expect(dto).toMatchObject({ schemaVersion: 1, id: 'model-synthetic-presentation' });
  expect(dto.views[0].nodes[2].kind).toBe('container');
  expect(dto.views[0].connections.map((connection) => connection.kind)).toEqual([
    'relationship', 'line', 'line'
  ]);
  expect(dto.diagnostics.map((diagnostic) => diagnostic.code)).toContain('DTO_UNSUPPORTED_FIELDS');
  const json = serializeModelDto(dto);
  expect(parseModelDto(json)).toEqual(dto);
  expect(json).not.toContain('elementsById');
});

it('applies the existing XML preflight limits with content-free errors', () => {
  const secret = 'SYNTHETIC_PRIVATE_SENTINEL';
  const deep = '<model>' + '<x>'.repeat(65) + '</x>'.repeat(65) + '</model>';
  for (const input of [null, `<model>${secret}</model>`, '<model',
    '<!DOCTYPE model [<!ENTITY x "expanded">]><model/>', deep,
    'x'.repeat(1_048_577), 'é'.repeat(600_000)]) {
    try {
      importMeffToModelDto(input);
      throw new Error('Expected the import to reject invalid XML.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MEFF_DTO_IMPORT_INVALID',
        message: 'Unable to import the ArchiMate model DTO.' });
      expect(String(error)).not.toContain(secret);
    }
  }
});
