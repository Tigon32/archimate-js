import { importMeffToModelDto } from './meff-import.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { validateModelDto } from './validate.js';
import type { ModelDto } from './types.js';

export interface DtoEditingReason {
  code: 'MEFF_DTO_IMPORT_INVALID' | 'DTO_UNSUPPORTED_FIELDS' | 'DTO_MEFF_ROUNDTRIP_UNSUPPORTED';
  message: string;
}

export type DtoEditingEligibility =
  | { eligible: true; model: ModelDto; reasons: [] }
  | { eligible: false; reasons: DtoEditingReason[] };

export type DtoMeffEditorEntry =
  | { eligible: true; model: ModelDto; editor: import('./editor.js').DiagramAdapter; reasons: [] }
  | { eligible: false; reasons: DtoEditingReason[] };

function sameData(source: unknown, target: unknown): boolean {
  if (Object.is(source, target)) return true;
  if (Array.isArray(source) || Array.isArray(target)) return Array.isArray(source) &&
    Array.isArray(target) && source.length === target.length &&
    source.every((item, index) => sameData(item, target[index]));
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return false;
  const left = source as Record<string, unknown>;
  const right = target as Record<string, unknown>;
  const keys = Reflect.ownKeys(left).filter((key) => left[key as string] !== undefined);
  const expected = Reflect.ownKeys(right).filter((key) => right[key as string] !== undefined);
  return keys.length === expected.length && keys.every((key) =>
    Reflect.has(right, key) && sameData(left[key as string], right[key as string]));
}

const IMPORT_REASON: DtoEditingReason = {
  code: 'MEFF_DTO_IMPORT_INVALID',
  message: 'This MEFF model cannot be imported for DTO editing.'
};
const UNSUPPORTED_FIELDS_REASON: DtoEditingReason = {
  code: 'DTO_UNSUPPORTED_FIELDS',
  message: 'This model contains fields that DTO editing cannot preserve.'
};
const ROUNDTRIP_REASON: DtoEditingReason = {
  code: 'DTO_MEFF_ROUNDTRIP_UNSUPPORTED',
  message: 'This model is outside the DTO editing and MEFF export subset.'
};

/** Only DTOs that can be saved without losing fields are eligible for persistent editing. */
export function assessModelDtoEditingEligibility(input: unknown): DtoEditingEligibility {
  let model: ModelDto;
  try {
    model = validateModelDto(input);
    if (!sameData(input, model)) return { eligible: false, reasons: [IMPORT_REASON] };
    if (model.diagnostics.length) return { eligible: false, reasons: [UNSUPPORTED_FIELDS_REASON] };
  } catch {
    return { eligible: false, reasons: [IMPORT_REASON] };
  }

  try {
    exportModelDtoToMeff(model);
  } catch {
    return { eligible: false, reasons: [ROUNDTRIP_REASON] };
  }
  return { eligible: true, model, reasons: [] };
}

/** Import MEFF and expose a DTO only when both import and export preserve it. */
export function checkMeffEditingEligibility(xml: unknown): DtoEditingEligibility {
  let model: ModelDto;
  try {
    model = importMeffToModelDto(xml);
  } catch {
    return { eligible: false, reasons: [IMPORT_REASON] };
  }
  return assessModelDtoEditingEligibility(model);
}

/** Create an editor only for an import proven safe by the DTO→MEFF→DTO round trip. */
export function createDtoEditorFromMeff(xml: unknown): DtoMeffEditorEntry {
  const eligibility = checkMeffEditingEligibility(xml);
  if (!eligibility.eligible) return eligibility;
  return { eligible: true, model: eligibility.model,
    editor: new editorModule.DiagramAdapter(eligibility.model), reasons: [] };
}

import * as editorModule from './editor.js';

export function editingIneligibleError(): TypeError {
  const error = new TypeError('This model is not eligible for DTO editing.');
  Object.assign(error, { code: 'DTO_EDITING_INELIGIBLE' });
  return error;
}
