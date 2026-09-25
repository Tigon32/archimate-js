import { expect, it } from 'vitest';
import { BUILTIN_LINT_RULES, createLintEngine, lintModel } from '../../src/lint/index.mjs';
import type { LintFindingDraft, LintRule } from '../../src/lint/index.mjs';
import type { ModelDto } from '../../src/model-dto/index.js';

const unsupportedRelationshipRuleId = 'archimate/unsupported-relationship';

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

// SYNTHETIC: relationship cases authored to exercise the reviewed semantic profile.
function syntheticRelationshipModel(): ModelDto {
  return {
    schemaVersion: 1,
    id: 'synthetic-relationship-model',
    elements: [
      { id: 'application-component', type: 'ApplicationComponent' },
      { id: 'application-function', type: 'ApplicationFunction' },
      { id: 'application-service', type: 'ApplicationService' }
    ],
    relationships: [
      { id: 'allowed-assignment', type: 'AssignmentRelationship',
        sourceId: 'application-component', targetId: 'application-function' },
      { id: 'disallowed-assignment', type: 'AssignmentRelationship',
        sourceId: 'application-function', targetId: 'application-component' },
      { id: 'unreviewed-relationship', type: 'UnknownRelationship',
        sourceId: 'application-component', targetId: 'application-service' }
    ],
    views: [],
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

it('reports reviewed-disallowed and unreviewed relationships, but accepts reviewed relationships', () => {
  const result = lintModel(syntheticRelationshipModel(), {
    enabledRuleIds: [unsupportedRelationshipRuleId]
  });
  expect(result.findings.map(({ subject, severity, message, remediation }) => ({
    conceptId: subject.kind === 'concept' ? subject.conceptId : undefined,
    severity, message, remediation
  }))).toEqual([
    {
      conceptId: 'disallowed-assignment',
      severity: 'warning',
      message: 'Relationship "disallowed-assignment" from "application-function" to ' +
        '"application-component" is explicitly disallowed by the reviewed ArchiMate 3.2 semantic profile.',
      remediation: {
        description: 'Review the relationship endpoints and semantic profile before relying on it.',
        reference: 'docs/standards/supported-semantics-profile.md'
      }
    },
    {
      conceptId: 'unreviewed-relationship',
      severity: 'warning',
      message: 'Relationship "unreviewed-relationship" from "application-component" to ' +
        '"application-service" is not covered by the reviewed ArchiMate 3.2 semantic profile.',
      remediation: {
        description: 'Review the relationship endpoints and semantic profile before relying on it.',
        reference: 'docs/standards/supported-semantics-profile.md'
      }
    }
  ]);
  expect(lintModel(syntheticRelationshipModel(), {
    enabledRuleIds: [unsupportedRelationshipRuleId],
    severityOverrides: { [unsupportedRelationshipRuleId]: 'error' }
  }).findings.map(({ severity }) => severity)).toEqual(['error', 'error']);
});

it('safely skips unresolved relationship endpoints when evaluated directly', () => {
  const model = syntheticModel();
  model.elements = [{ id: 'known-target', type: 'ApplicationFunction' }];
  model.relationships = [{
    id: 'broken-reference', type: 'AssignmentRelationship',
    sourceId: 'missing-source', targetId: 'known-target'
  }];
  const rule = BUILTIN_LINT_RULES.find(({ id }) => id === unsupportedRelationshipRuleId)!;
  expect(() => rule.evaluate(model, { mode: 'full', changedSubjectIds: [] })).not.toThrow();
  expect(rule.evaluate(model, { mode: 'full', changedSubjectIds: [] })).toEqual([]);
});

it('supports disabling the built-in rule with an off override or enabled-rule selection', () => {
  const model = syntheticRelationshipModel();
  expect(lintModel(model, {
    enabledRuleIds: [unsupportedRelationshipRuleId],
    severityOverrides: { [unsupportedRelationshipRuleId]: 'off' }
  })).toMatchObject({
    findings: [],
    execution: { mode: 'full', rulesRun: 0 }
  });
  expect(lintModel(model, { enabledRuleIds: [] }).execution.rulesRun).toBe(0);
});

it('orders relationship findings independently of DTO object and relationship order', () => {
  const model = syntheticRelationshipModel();
  const reorderedModel: ModelDto = {
    diagnostics: model.diagnostics,
    relationships: [...model.relationships].reverse().map((relationship) => ({
      targetId: relationship.targetId,
      sourceId: relationship.sourceId,
      documentation: relationship.documentation,
      name: relationship.name,
      type: relationship.type,
      id: relationship.id
    })),
    views: model.views,
    elements: [...model.elements].reverse().map((element) => ({
      documentation: element.documentation,
      name: element.name,
      type: element.type,
      id: element.id
    })),
    id: model.id,
    schemaVersion: model.schemaVersion
  };
  const config = { enabledRuleIds: [unsupportedRelationshipRuleId] };
  expect(lintModel(model, config)).toEqual(lintModel(reorderedModel, config));
});

it('coexists with the existing model and concept name rules', () => {
  const result = lintModel(syntheticRelationshipModel());
  expect(result.findings.map(({ ruleId }) => ruleId)).toContain('core.model-name-present');
  expect(result.findings.map(({ ruleId }) => ruleId)).toContain('core.concept-name-present');
  expect(result.findings.map(({ ruleId }) => ruleId)).toContain(unsupportedRelationshipRuleId);
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
