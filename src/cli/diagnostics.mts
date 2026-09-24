import type { CliDiagnostic } from './types.mjs';

export const SAFE_MESSAGES = Object.freeze({
  BROWSER_LAUNCH_FAILED: 'Unable to start the configured Chrome or Chromium executable.',
  BROWSER_NOT_FOUND: 'Chrome or Chromium was not found. Set CHROME_BIN or use --chrome.',
  BATCH_VIEWS_INVALID: 'No unambiguous supported diagram views are available for batch export.',
  CLI_INTERNAL_ERROR: 'The command could not be completed.',
  CLI_USAGE: 'Command options are invalid. Run archimate-js --help for usage.',
  EXPORT_OUTPUT_WRITE_FAILED: 'Unable to write the requested output files.',
  EXPORT_AREA_EXCEEDED: 'The requested export exceeds the supported pixel budget.',
  EXPORT_DIMENSIONS_EXCEEDED: 'The requested export exceeds the supported dimensions.',
  EXPORT_DIMENSIONS_INVALID: 'The rendered view has invalid dimensions.',
  FONT_READY_FAILED: 'Fonts did not become ready before capture.',
  INPUT_READ_FAILED: 'Unable to read the model file.',
  INPUT_SIZE_LIMIT: 'The ArchiMate model exceeds the supported size limit.',
  OUTPUT_CLEANUP_FAILED: 'Unable to remove incomplete output files.',
  OUTPUT_WRITE_FAILED: 'Unable to write the SVG output file.',
  PDF_TRANSPARENT_BACKGROUND: 'PDF export requires an opaque background.',
  RENDER_BUILD_MISSING: 'The browser renderer build is unavailable. Run the package compile command.',
  VIEW_RENDER_FAILED: 'Unable to render the requested ArchiMate view.'
});

const RENDER_MESSAGES: Record<string, string> = {
  INVALID_OPTIONS: 'Viewer options are invalid.',
  MODEL_TOO_LARGE: 'The ArchiMate model exceeds the supported size limit.',
  MODEL_IMPORT_FAILED: 'Unable to load the ArchiMate model.',
  VIEW_NOT_FOUND: 'The requested ArchiMate view was not found.',
  VIEW_NAME_AMBIGUOUS: 'The requested ArchiMate view name is ambiguous.',
  VIEW_RENDER_FAILED: 'Unable to render the requested ArchiMate view.',
  VIEW_SELECTION_FAILED: 'Unable to open the requested ArchiMate view.',
  VIEWER_FAILURE: 'Unable to render the ArchiMate view.'
};

export function diagnostic(code: string): CliDiagnostic {
  const message = SAFE_MESSAGES[code as keyof typeof SAFE_MESSAGES] ??
    RENDER_MESSAGES[code] ?? SAFE_MESSAGES.CLI_INTERNAL_ERROR;
  return { code, severity: 'error', layer: 'cli', message };
}

export function safeErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code in SAFE_MESSAGES || code in RENDER_MESSAGES) return code;
  return 'CLI_INTERNAL_ERROR';
}
