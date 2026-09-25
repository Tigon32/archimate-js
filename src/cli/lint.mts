import { diagnostic } from './diagnostics.mjs';
import { readBoundedXml } from './io.mjs';
import type { LintOptions } from './types.mjs';
import type { LintResult, LintSubject } from '../lint/types.mjs';

type DtoApi = { importMeffToModelDto(xml: unknown): unknown };
type LintApi = { lintModel(input: unknown): LintResult };

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function subjectName(subject: LintSubject): string {
  if (subject.kind === 'model') return `model ${subject.modelId}`;
  if (subject.kind === 'view') return `view ${subject.viewId}`;
  return `concept ${subject.conceptId}`;
}

function summary(result: LintResult): { errors: number; warnings: number; info: number } {
  return result.findings.reduce((counts, finding) => {
    if (finding.severity === 'error') counts.errors++;
    else if (finding.severity === 'warning') counts.warnings++;
    else counts.info++;
    return counts;
  }, { errors: 0, warnings: 0, info: 0 });
}

export function lintExitCode(result: LintResult): 0 | 1 | 2 {
  if (result.diagnostics.length) return 2;
  return result.findings.some((finding) => finding.severity === 'error') ? 1 : 0;
}

export function formatLintResult(result: LintResult, format: LintOptions['format']): string {
  const counts = summary(result);
  if (format === 'json') {
    return `${JSON.stringify({
      command: 'lint',
      result: result.diagnostics.length ? 'failed' : result.findings.length ? 'findings' : 'clean',
      findings: result.findings,
      diagnostics: result.diagnostics,
      execution: result.execution,
      summary: { ...counts, total: result.findings.length }
    }, null, 2)}\n`;
  }

  const outcome = result.diagnostics.length ? 'failed' : result.findings.length ? 'findings' : 'clean';
  const lines = [`Lint: ${outcome}`];
  for (const finding of result.findings) {
    lines.push(`${finding.ruleId} [${finding.severity}] ${subjectName(finding.subject)}: ${finding.message}`);
    if (finding.remediation) {
      const reference = finding.remediation.reference ? ` (${finding.remediation.reference})` : '';
      lines.push(`  Remediation: ${finding.remediation.description}${reference}`);
    }
  }
  for (const item of result.diagnostics) {
    lines.push(`Engine diagnostic ${item.code} (${item.ruleId}): ${item.message}`);
  }
  lines.push(`Summary: ${result.findings.length} findings ` +
    `(${counts.errors} errors, ${counts.warnings} warnings, ${counts.info} info)`);
  return `${lines.join('\n')}\n`;
}

function emitFailure(format: LintOptions['format'], code: string): 2 {
  const item = diagnostic(code);
  if (format === 'json') {
    emit({ command: 'lint', valid: false, findings: [], diagnostics: [item] });
  } else {
    process.stdout.write(`Lint failed: ${item.message}\n`);
  }
  return 2;
}

async function loadDtoApi(): Promise<DtoApi> {
  const loaded: unknown = await import(new URL('../model-dto/index.js', import.meta.url).href);
  if (!loaded || typeof loaded !== 'object' || !('importMeffToModelDto' in loaded) ||
      typeof loaded.importMeffToModelDto !== 'function') throw new Error();
  return loaded as DtoApi;
}

async function loadLintApi(): Promise<LintApi> {
  const loaded: unknown = await import(new URL('../lint/index.mjs', import.meta.url).href);
  if (!loaded || typeof loaded !== 'object' || !('lintModel' in loaded) ||
      typeof loaded.lintModel !== 'function') throw new Error();
  return loaded as LintApi;
}

export async function executeLint(options: LintOptions): Promise<number> {
  let xml: string;
  try {
    xml = await readBoundedXml(options.input);
  } catch {
    return emitFailure(options.format, 'LINT_INPUT_INVALID');
  }

  let dtoApi: DtoApi;
  try {
    dtoApi = await loadDtoApi();
  } catch {
    return emitFailure(options.format, 'LINT_ENGINE_FAILED');
  }

  let dto: unknown;
  try {
    dto = dtoApi.importMeffToModelDto(xml);
  } catch {
    return emitFailure(options.format, 'LINT_INPUT_INVALID');
  }

  let result: LintResult;
  try {
    result = (await loadLintApi()).lintModel(dto);
  } catch {
    return emitFailure(options.format, 'LINT_ENGINE_FAILED');
  }
  process.stdout.write(formatLintResult(result, options.format));
  return lintExitCode(result);
}
