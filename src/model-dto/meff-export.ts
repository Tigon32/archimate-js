// Legacy exporter interop for issue #92; migrate the complete serializer with
// the public MEFF path after the typed editor/persistence boundary is ready.
// @ts-expect-error Existing MEFF serializer is untyped first-party JavaScript.
import { exportMeff } from '../../lib/export/Meff.js';
import { importMeffToModelDto } from './meff-import.js';
import { toMeffShape } from './meff-export-shape.js';
import { serializeModelDto, validateModelDto } from './validate.js';

function exportFailure(): never {
  const error = new TypeError('Unable to export the ArchiMate model DTO as MEFF.');
  Object.assign(error, { code: 'MEFF_DTO_EXPORT_INVALID' });
  throw error;
}

function sameData(input: unknown, projected: unknown): boolean {
  if (Object.is(input, projected)) return true;
  if (Array.isArray(input) || Array.isArray(projected)) {
    return Array.isArray(input) && Array.isArray(projected) &&
      input.length === projected.length && input.every((item, index) => sameData(item, projected[index]));
  }
  if (!input || !projected || typeof input !== 'object' || typeof projected !== 'object') return false;
  const source = input as Record<string, unknown>;
  const target = projected as Record<string, unknown>;
  const keys = Reflect.ownKeys(source).filter((key) => source[key as string] !== undefined);
  const expected = Reflect.ownKeys(target).filter((key) => target[key as string] !== undefined);
  return keys.length === expected.length && keys.every((key) =>
    Reflect.has(target, key) && sameData(source[key as string], target[key as string]));
}

/** Fail closed if the supported DTO subset cannot survive a MEFF round trip. */
export function exportModelDtoToMeff(input: unknown): string {
  try {
    const dto = validateModelDto(input);
    if (dto.diagnostics.length || !sameData(input, dto)) return exportFailure();
    const result: unknown = exportMeff(toMeffShape(dto));
    if (!result || typeof result !== 'object' || !('xml' in result) ||
        typeof result.xml !== 'string' || !('diagnostics' in result) ||
        !Array.isArray(result.diagnostics) || result.diagnostics.length) return exportFailure();
    const reparsed = importMeffToModelDto(result.xml);
    if (reparsed.diagnostics.length || serializeModelDto(reparsed) !== serializeModelDto(dto)) {
      return exportFailure();
    }
    return result.xml;
  } catch {
    return exportFailure();
  }
}
