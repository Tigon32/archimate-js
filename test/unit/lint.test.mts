import { expect, it } from 'vitest';
import { createLintEngine, lintModel } from '../../src/lint/index.mjs';
import type { LintFindingDraft, LintRule } from '../../src/lint/index.mjs';
import type { ModelDto } from '../../src/model-dto/index.js';

// SYNTHETIC: a minimal DTO authored in this test; it is not copied from a project model.
function syntheticModel(): ModelDto {
  return {
    schemaVersion: 1,
    id: 'synthetic-model',
    elements: [{ id: 'element-one', type: 'BusinessActor' }],
    relationships: [],
    views: [{ id: 'view-one', nodes: [], connections: [] }],
    diagnostics: []
  };
}

it('returns model, view, and concept findings with typed remediation', () => {
    const result = lintModel(syntheticModel());
    expect(result.findings.map(({ ruleId, subject }) => [ruleId, subject.kind])).toEqual([
      ['core.concept-name-present', 'concept'],
      ['core.model-name-present', 'model'],
      ['core.view-name-present', 'view']
    ]);
    expect(result.findings.every((finding) => finding.remediation?.description.length)).toBe(true);
    expect(result.diagnostics).toEqual([]);
});

it('sorts rules and findings deterministically and applies validated configuration', () => {
    const model = syntheticModel();
    const calls: string[] = [];
    const finding = (message: string): LintFindingDraft => ({ severity: 'warning', message,
      subject: { kind: 'model', modelId: model.id } });
    const later: LintRule = { id: 'test.zeta', evaluate: () => {
      calls.push('test.zeta');
      return [finding('z'), finding('a')];
    } };
    const earlier: LintRule = { id: 'test.alpha', evaluate: () => {
      calls.push('test.alpha');
      return [finding('middle')];
    } };
    const engine = createLintEngine([later, earlier]);
    expect(engine.ruleIds).toEqual(['test.alpha', 'test.zeta']);
    const result = engine.run(model, { enabledRuleIds: ['test.zeta', 'test.alpha'],
      severityOverrides: { 'test.zeta': 'info' }, mode: 'incremental',
      changedSubjectIds: ['synthetic-model'] });
    expect(calls).toEqual(['test.alpha', 'test.zeta']);
    expect(result).toEqual({
      findings: [
        { ruleId: 'test.alpha', severity: 'warning', message: 'middle',
          subject: { kind: 'model', modelId: model.id }, remediation: undefined },
        { ruleId: 'test.zeta', severity: 'info', message: 'a',
          subject: { kind: 'model', modelId: model.id }, remediation: undefined },
        { ruleId: 'test.zeta', severity: 'info', message: 'z',
          subject: { kind: 'model', modelId: model.id }, remediation: undefined }
      ],
      diagnostics: [],
      execution: { mode: 'incremental', rulesRun: 2 }
    });
});

it('reports the stable result through the typed reporter contract', () => {
    const reports: string[] = [];
    const result = lintModel(syntheticModel(), undefined, {
      reportFinding: (finding) => reports.push(`finding:${finding.ruleId}`),
      reportDiagnostic: (diagnostic) => reports.push(`diagnostic:${diagnostic.code}`)
    });
    expect(reports).toEqual(result.findings.map(({ ruleId }) => `finding:${ruleId}`));
    expect(Object.isFrozen(result.findings[0].subject)).toBe(true);
});

it('rejects unknown IDs, malformed options, and duplicate rules explicitly', () => {
    const engine = createLintEngine([]);
    expect(() => engine.run(syntheticModel(), { enabledRuleIds: ['unknown.rule'] }))
      .toThrow(/Unknown lint rule ID/);
    expect(() => engine.run(syntheticModel(), { mode: 'fast' as 'full' }))
      .toThrow(/mode must be/);
    expect(() => engine.run(syntheticModel(), { unexpected: true } as never))
      .toThrow(/Unknown lint configuration field/);
    const rule: LintRule = { id: 'test.duplicate', evaluate: () => [] };
    expect(() => createLintEngine([rule, rule])).toThrow(/must be unique/);
});

it('isolates throwing rules and keeps the original DTO unchanged', () => {
    const input = syntheticModel();
    const before = structuredClone(input);
    let survivorRan = false;
    const mutator: LintRule = { id: 'test.mutator', evaluate: (model) => {
      (model as unknown as { name: string }).name = 'changed';
      return [];
    } };
    const survivor: LintRule = { id: 'test.survivor', evaluate: (model) => {
      survivorRan = true;
      return [{ severity: 'info', message: model.id,
        subject: { kind: 'model', modelId: model.id } }];
    } };
    const result = createLintEngine([survivor, mutator]).run(input);
    expect(input).toEqual(before);
    expect(survivorRan).toBe(true);
    expect(result.diagnostics).toEqual([{ code: 'LINT_RULE_FAILED', ruleId: 'test.mutator',
      message: 'Lint rule "test.mutator" failed; other rules continued.' }]);
    expect(result.findings).toHaveLength(1);
});

it('keeps the changedSubjectIds context frozen so one rule cannot influence a later rule', () => {
    const input = syntheticModel();
    let capturedContext: { changedSubjectIds: readonly string[] } | undefined;
    let laterRuleObservedIds: readonly string[] = [];
    const injector: LintRule = { id: 'test.a-injector', evaluate: (_model, context) => {
      capturedContext = context;
      try {
        (context.changedSubjectIds as string[]).push('injected');
      } catch {
        // Expected when frozen; swallow so the rule reports a clean (non-failure) result.
      }
      return [];
    } };
    const observer: LintRule = { id: 'test.b-observer', evaluate: (_model, context) => {
      laterRuleObservedIds = context.changedSubjectIds;
      return [];
    } };
    const result = createLintEngine([injector, observer]).run(input, { changedSubjectIds: [input.id] });
    expect(result.diagnostics).toEqual([]);
    expect(Object.isFrozen(capturedContext?.changedSubjectIds)).toBe(true);
    expect(laterRuleObservedIds).toEqual([input.id]);
});

it('rejects findings for subjects outside the validated DTO as rule failures', () => {
    const rule: LintRule = { id: 'test.invalid-subject', evaluate: (model) => [{
      severity: 'warning', message: 'invalid subject',
      subject: { kind: 'view', modelId: model.id, viewId: 'missing-view' }
    }] };
    const result = createLintEngine([rule]).run(syntheticModel());
    expect(result.findings).toEqual([]);
    expect(result.diagnostics.map(({ ruleId }) => ruleId)).toEqual(['test.invalid-subject']);
});
