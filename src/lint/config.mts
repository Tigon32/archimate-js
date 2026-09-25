import type { LintConfig, LintRunMode, LintSeverity } from './types.mjs';

const SEVERITIES = new Set<LintSeverity>(['error', 'warning', 'info']);
const MODES = new Set<LintRunMode>(['full', 'incremental']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Lint configuration must be an object.');
  }
  return value as Record<string, unknown>;
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError(`Lint configuration ${name} must be an array of non-empty strings.`);
  }
  const items = value as string[];
  if (items.length !== new Set(items).size) {
    throw new TypeError(`Lint configuration ${name} must not contain duplicates.`);
  }
  return [...items];
}

export interface NormalizedLintConfig {
  enabledRuleIds: readonly string[];
  severityOverrides: Readonly<Record<string, LintSeverity>>;
  mode: LintRunMode;
  changedSubjectIds: readonly string[];
}

export function normalizeLintConfig(input: unknown, knownRuleIds: ReadonlySet<string>,
  defaultRuleIds: readonly string[]): NormalizedLintConfig {
  const data = input === undefined ? {} : record(input);
  const allowedKeys = new Set(['enabledRuleIds', 'severityOverrides', 'mode', 'changedSubjectIds']);
  const unknownKeys = Object.keys(data).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new TypeError(`Unknown lint configuration field: ${unknownKeys.sort(compare)[0]}.`);
  }

  const enabledRuleIds = data.enabledRuleIds === undefined
    ? [...defaultRuleIds]
    : stringList(data.enabledRuleIds, 'enabledRuleIds').sort(compare);
  const unknownRuleIds = enabledRuleIds.filter((id) => !knownRuleIds.has(id)).sort(compare);
  if (unknownRuleIds.length) {
    throw new TypeError(`Unknown lint rule ID: ${unknownRuleIds[0]}.`);
  }

  const overridesData = data.severityOverrides === undefined ? {} : record(data.severityOverrides);
  const severityOverrides: Record<string, LintSeverity> = {};
  for (const id of Object.keys(overridesData).sort(compare)) {
    if (!knownRuleIds.has(id)) throw new TypeError(`Unknown lint rule ID: ${id}.`);
    const severity = overridesData[id];
    if (typeof severity !== 'string' || !SEVERITIES.has(severity as LintSeverity)) {
      throw new TypeError(`Invalid severity override for lint rule ${id}.`);
    }
    severityOverrides[id] = severity as LintSeverity;
  }

  const mode = data.mode === undefined ? 'full' : data.mode;
  if (typeof mode !== 'string' || !MODES.has(mode as LintRunMode)) {
    throw new TypeError('Lint configuration mode must be "full" or "incremental".');
  }
  const changedSubjectIds = data.changedSubjectIds === undefined
    ? [] : stringList(data.changedSubjectIds, 'changedSubjectIds').sort(compare);
  return { enabledRuleIds, severityOverrides, mode: mode as LintRunMode, changedSubjectIds };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
