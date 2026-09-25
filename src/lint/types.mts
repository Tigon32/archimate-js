import type { ModelDto } from '../model-dto/types.js';

export type LintSeverity = 'error' | 'warning' | 'info';
export type LintSeverityOverride = LintSeverity | 'off';
export type LintRunMode = 'full' | 'incremental';

export type LintSubject =
  | { kind: 'model'; modelId: string }
  | { kind: 'view'; modelId: string; viewId: string }
  | { kind: 'concept'; modelId: string; conceptId: string };

export interface LintRemediation {
  description: string;
  reference?: string;
}

export interface LintFinding {
  ruleId: string;
  severity: LintSeverity;
  message: string;
  subject: LintSubject;
  remediation?: LintRemediation;
}

export type LintFindingDraft = Omit<LintFinding, 'ruleId'>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
    : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface LintRuleContext {
  readonly mode: LintRunMode;
  /** Hints for future incremental evaluators; the current engine still runs every enabled rule. */
  readonly changedSubjectIds: readonly string[];
}

export interface LintRule {
  readonly id: string;
  readonly evaluate: (model: DeepReadonly<ModelDto>, context: LintRuleContext) =>
    readonly LintFindingDraft[];
}

export interface LintConfig {
  readonly enabledRuleIds?: readonly string[];
  readonly severityOverrides?: Readonly<Record<string, LintSeverityOverride>>;
  readonly mode?: LintRunMode;
  readonly changedSubjectIds?: readonly string[];
}

export interface LintDiagnostic {
  code: 'LINT_RULE_FAILED';
  ruleId: string;
  message: string;
}

export interface LintExecutionSummary {
  mode: LintRunMode;
  rulesRun: number;
}

export interface LintResult {
  findings: readonly LintFinding[];
  diagnostics: readonly LintDiagnostic[];
  execution: LintExecutionSummary;
}

export interface LintReporter {
  reportFinding(finding: DeepReadonly<LintFinding>): void;
  reportDiagnostic(diagnostic: DeepReadonly<LintDiagnostic>): void;
}
