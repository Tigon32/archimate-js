import { expect, it } from 'vitest';
import { formatLintResult, lintExitCode } from '../../src/cli/lint.mjs';
import type { LintResult } from '../../src/lint/types.mjs';

function result(severities: Array<'error' | 'warning' | 'info'>, diagnostic = false): LintResult {
  return {
    findings: severities.map((severity, index) => ({
      ruleId: `test.rule-${index}`,
      severity,
      message: `Synthetic finding ${index}`,
      subject: { kind: 'model', modelId: 'synthetic-model' }
    })),
    diagnostics: diagnostic ? [{ code: 'LINT_RULE_FAILED', ruleId: 'test.rule-failed',
      message: 'Lint rule "test.rule-failed" failed; other rules continued.' }] : [],
    execution: { mode: 'full', rulesRun: 1 }
  };
}

it('uses the documented exit statuses for error findings and engine failures', () => {
  expect(lintExitCode(result([]))).toBe(0);
  expect(lintExitCode(result(['warning', 'info']))).toBe(0);
  expect(lintExitCode(result(['error']))).toBe(1);
  expect(lintExitCode(result(['error'], true))).toBe(2);
  expect(JSON.parse(formatLintResult(result([], true), 'json')).result).toBe('failed');
  expect(formatLintResult(result([], true), 'human')).toMatch(/^Lint: failed/);
});

it('renders complete deterministic JSON and human reports from the same findings', () => {
  const lintResult = result(['warning', 'info']);
  const json = formatLintResult(lintResult, 'json');
  expect(json).toBe(formatLintResult(lintResult, 'json'));
  expect(JSON.parse(json)).toMatchObject({
    command: 'lint', result: 'findings', findings: lintResult.findings,
    diagnostics: [], execution: lintResult.execution,
    summary: { errors: 0, warnings: 1, info: 1, total: 2 }
  });
  const human = formatLintResult(lintResult, 'human');
  expect(human).toContain('test.rule-0 [warning] model synthetic-model: Synthetic finding 0');
  expect(human).toContain('test.rule-1 [info] model synthetic-model: Synthetic finding 1');
  expect(human).toContain('Summary: 2 findings (0 errors, 1 warnings, 1 info)');
});
