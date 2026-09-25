import { createLintEngine } from './engine.mjs';
import type { LintConfig, LintFindingDraft, LintReporter, LintRule } from './types.mjs';

const modelNameRule: LintRule = {
  id: 'core.model-name-present',
  evaluate: (model) => model.name?.trim() ? [] : [{
    severity: 'warning',
    message: 'The model has no descriptive name.',
    subject: { kind: 'model', modelId: model.id },
    remediation: { description: 'Add a descriptive model name.' }
  }]
};

const viewNameRule: LintRule = {
  id: 'core.view-name-present',
  evaluate: (model) => model.views.flatMap((view) => view.name?.trim() ? [] : [{
    severity: 'warning' as const,
    message: 'The view has no descriptive name.',
    subject: { kind: 'view' as const, modelId: model.id, viewId: view.id },
    remediation: { description: 'Add a descriptive view name.' }
  }])
};

const conceptNameRule: LintRule = {
  id: 'core.concept-name-present',
  evaluate: (model) => [...model.elements, ...model.relationships]
    .filter((concept) => !concept.name?.trim())
    .map((concept): LintFindingDraft => ({
      severity: 'info',
      message: 'The concept has no display name.',
      subject: { kind: 'concept', modelId: model.id, conceptId: concept.id },
      remediation: { description: 'Add a display name when one is available.' }
    }))
};

export const BUILTIN_LINT_RULES: readonly LintRule[] = Object.freeze([
  modelNameRule, viewNameRule, conceptNameRule
].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const builtInEngine = createLintEngine(BUILTIN_LINT_RULES);

export function lintModel(input: unknown, config?: LintConfig, reporter?: LintReporter) {
  return builtInEngine.run(input, config, reporter);
}
