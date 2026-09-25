import { validateModelDto } from '../model-dto/validate.js';
import type { ModelDto } from '../model-dto/types.js';
import { normalizeLintConfig } from './config.mjs';
import type {
  DeepReadonly, LintConfig, LintDiagnostic, LintFinding, LintFindingDraft,
  LintReporter, LintResult, LintRule, LintSeverity, LintSubject
} from './types.mjs';

const RULE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)?$/;
const SEVERITIES = new Set<LintSeverity>(['error', 'warning', 'info']);

export interface LintEngine {
  readonly ruleIds: readonly string[];
  run(input: unknown, config?: LintConfig, reporter?: LintReporter): LintResult;
}

export function createLintEngine(rules: readonly LintRule[]): LintEngine {
  if (!Array.isArray(rules)) throw new TypeError('Lint rules must be an array.');
  if (rules.some((rule) => !rule || typeof rule.id !== 'string' || !RULE_ID.test(rule.id) ||
      typeof rule.evaluate !== 'function')) {
    throw new TypeError('Each lint rule must have a valid ID and evaluate function.');
  }
  const sortedRules = rules.map((rule) => Object.freeze({ ...rule }))
    .sort((left, right) => compare(left.id, right.id));
  const ruleIds = sortedRules.map((rule) => {
    return rule.id;
  });
  if (ruleIds.length !== new Set(ruleIds).size) {
    throw new TypeError('Lint rule IDs must be unique.');
  }
  const knownRuleIds = new Set(ruleIds);
  const byId = new Map(sortedRules.map((rule) => [rule.id, rule]));

  return Object.freeze({
    ruleIds: Object.freeze(ruleIds),
    run(input: unknown, config?: LintConfig, reporter?: LintReporter): LintResult {
      const normalized = normalizeLintConfig(config, knownRuleIds, ruleIds);
      return runRules(deepFreeze(validateModelDto(input)), normalized, byId, reporter);
    }
  });
}

function runRules(model: DeepReadonly<ModelDto>,
  config: ReturnType<typeof normalizeLintConfig>, rules: ReadonlyMap<string, LintRule>,
  reporter?: LintReporter): LintResult {
  const findings: LintFinding[] = [];
  const diagnostics: LintDiagnostic[] = [];
  const changedSubjectIds = Object.freeze([...config.changedSubjectIds]);
  const rulesToRun = config.enabledRuleIds.filter((ruleId) =>
    config.severityOverrides[ruleId] !== 'off');
  for (const ruleId of rulesToRun) {
    try {
      const rule = rules.get(ruleId)!;
      const drafts = rule.evaluate(model, Object.freeze({ mode: config.mode, changedSubjectIds }));
      if (!Array.isArray(drafts)) throw new TypeError('Rule returned an invalid result.');
      const severityOverride = config.severityOverrides[ruleId];
      findings.push(...drafts.map((draft) => normalizeFinding(ruleId, draft, model,
        severityOverride === 'off' ? undefined : severityOverride)));
    } catch {
      diagnostics.push({ code: 'LINT_RULE_FAILED', ruleId,
        message: `Lint rule "${ruleId}" failed; other rules continued.` });
    }
  }
  findings.sort(compareFindings);
  diagnostics.sort((left, right) => compare(left.ruleId, right.ruleId));
  const result = deepFreeze({ findings, diagnostics,
    execution: { mode: config.mode, rulesRun: rulesToRun.length } });
  if (reporter) {
    result.findings.forEach((finding) => reporter.reportFinding(finding));
    result.diagnostics.forEach((diagnostic) => reporter.reportDiagnostic(diagnostic));
  }
  return result;
}

function normalizeFinding(ruleId: string, draft: LintFindingDraft, model: DeepReadonly<ModelDto>,
  severityOverride?: LintSeverity): LintFinding {
  if (!draft || typeof draft !== 'object' || typeof draft.message !== 'string' ||
      !draft.message.trim() || !validSeverity(draft.severity) || !validSubject(draft.subject, model)) {
    throw new TypeError('Rule returned an invalid finding.');
  }
  const remediation = draft.remediation;
  if (remediation !== undefined && (!remediation || typeof remediation !== 'object' ||
      typeof remediation.description !== 'string' || !remediation.description.trim() ||
      remediation.reference !== undefined && typeof remediation.reference !== 'string')) {
    throw new TypeError('Rule returned invalid remediation metadata.');
  }
  return {
    ruleId,
    severity: severityOverride ?? draft.severity,
    message: draft.message,
    subject: { ...draft.subject } as LintSubject,
    remediation: remediation ? { ...remediation } : undefined
  };
}

function validSeverity(value: unknown): value is LintSeverity {
  return typeof value === 'string' && SEVERITIES.has(value as LintSeverity);
}

function validSubject(value: unknown, model: DeepReadonly<ModelDto>): value is LintSubject {
  if (!value || typeof value !== 'object') return false;
  const subject = value as Record<string, unknown>;
  const keys = Object.keys(subject).sort(compare);
  if (subject.modelId !== model.id) return false;
  if (subject.kind === 'model') return keys.length === 2 && keys[0] === 'kind' && keys[1] === 'modelId';
  if (subject.kind === 'view') return keys.length === 3 && keys.includes('viewId') &&
    typeof subject.viewId === 'string' &&
    model.views.some((view) => view.id === subject.viewId);
  if (subject.kind === 'concept') return keys.length === 3 && keys.includes('conceptId') &&
    typeof subject.conceptId === 'string' &&
    [...model.elements, ...model.relationships].some((concept) => concept.id === subject.conceptId);
  return false;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value as DeepReadonly<T>;
}

function compareFindings(left: LintFinding, right: LintFinding): number {
  return compare(left.ruleId, right.ruleId) || compare(left.subject.kind, right.subject.kind) ||
    compare(subjectId(left.subject), subjectId(right.subject)) || compare(left.severity, right.severity) ||
    compare(left.message, right.message) ||
    compare(left.remediation?.description ?? '', right.remediation?.description ?? '') ||
    compare(left.remediation?.reference ?? '', right.remediation?.reference ?? '');
}

function subjectId(subject: LintSubject): string {
  return subject.kind === 'model' ? subject.modelId
    : subject.kind === 'view' ? `${subject.modelId}/${subject.viewId}`
      : `${subject.modelId}/${subject.conceptId}`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
