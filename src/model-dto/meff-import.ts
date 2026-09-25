import { parseMeffModel } from './import/meff-model.js';
import { parseMeffViews } from './import/meff-view.js';
import { preflightImportXml } from './import/xml-preflight.js';
import type { ModelDto } from './types.js';
import { projectImportedModelDto } from './project.js';
import { list, record } from './validate.js';

function importFailure(): never {
  const error = new TypeError('Unable to import the ArchiMate model DTO.');
  Object.assign(error, { code: 'MEFF_DTO_IMPORT_INVALID' });
  throw error;
}

/** Existing XML preflight limits also govern the public DTO projection. */
export function importMeffToModelDto(xml: unknown): ModelDto {
  try {
    const preflight = record(preflightImportXml(xml));
    if (list(preflight.diagnostics).length || typeof xml !== 'string' || !xml.length) {
      return importFailure();
    }
    const parsed: unknown = parseMeffModel(xml, {
      create: (_type: string, attrs: Record<string, unknown> = {}) => ({ ...attrs })
    });
    const result = record(parsed);
    const model = record(result.rootElement);
    const views: unknown = parseMeffViews(xml, model);
    const viewResult = record(views);
    model.views = viewResult.views;
    result.diagnostics = [ ...list(result.diagnostics), ...list(viewResult.diagnostics),
      ...list(preflight.warnings) ];
    return projectImportedModelDto(result);
  } catch {
    return importFailure();
  }
}
