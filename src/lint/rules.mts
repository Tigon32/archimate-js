import { createLintEngine } from './engine.mjs';
import { validateRelationshipSemantics } from '../language/relationship-semantics.mjs';
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

const unsupportedRelationshipRule: LintRule = {
  id: 'archimate/unsupported-relationship',
  evaluate: (model) => {
    const concepts = new Map<string, { type: string; kind: 'element' | 'relationship' }>();
    model.elements.forEach((concept) => concepts.set(concept.id,
      { type: concept.type, kind: 'element' }));
    model.relationships.forEach((concept) => concepts.set(concept.id,
      { type: concept.type, kind: 'relationship' }));
    return [...model.relationships]
      .sort((left, right) => compare(left.id, right.id))
      .flatMap((relationship): LintFindingDraft[] => {
        const source = concepts.get(relationship.sourceId);
        const target = concepts.get(relationship.targetId);
        if (!source || !target) return [];
        const semantic = validateRelationshipSemantics({
          sourceType: source.type,
          relationshipType: relationship.type,
          targetType: target.type,
          sourceKind: source.kind,
          targetKind: target.kind
        });
        if (semantic.decision === 'allowed') return [];
        const status = semantic.decision === 'disallowed' ? 'explicitly disallowed' : 'not covered';
        return [{
          severity: 'warning',
          message: `Relationship "${relationship.id}" from "${relationship.sourceId}" to ` +
            `"${relationship.targetId}" is ${status} by the reviewed ArchiMate ` +
            `${semantic.archimateVersion} semantic profile.`,
          subject: { kind: 'concept', modelId: model.id, conceptId: relationship.id },
          remediation: {
            description: 'Review the relationship endpoints and semantic profile before relying on it.',
            reference: 'docs/standards/supported-semantics-profile.md'
          }
        }];
      });
  }
};

export const BUILTIN_LINT_RULES: readonly LintRule[] = Object.freeze([
  modelNameRule, viewNameRule, conceptNameRule, unsupportedRelationshipRule
].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const builtInEngine = createLintEngine(BUILTIN_LINT_RULES);

export function lintModel(input: unknown, config?: LintConfig, reporter?: LintReporter) {
  return builtInEngine.run(input, config, reporter);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
