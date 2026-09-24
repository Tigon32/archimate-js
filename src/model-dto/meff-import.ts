// Legacy parser interop for issue #92: migrate these modules to TypeScript when
// the complete public MEFF importer is moved behind the typed DTO boundary.
// @ts-expect-error MeffModel.js is untyped first-party JavaScript.
import { parseMeffModel } from '../../lib/import/MeffModel.js';
// @ts-expect-error MeffView.js is untyped first-party JavaScript.
import { parseMeffViews } from '../../lib/import/MeffView.js';
// @ts-expect-error XmlPreflight.js is untyped first-party JavaScript.
import { preflightImportXml } from '../../lib/import/XmlPreflight.js';
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
      create: (_type: string, attrs: object = {}) => ({ ...attrs })
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
