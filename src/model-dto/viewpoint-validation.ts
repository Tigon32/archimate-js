import { validateModelDto } from './validate.js';
import type { ModelDto, ViewDto, ViewNodeDto } from './types.js';

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;

export type ViewpointSeverity = 'error' | 'warning' | 'info';
export type ViewpointRuleKind = 'require-element-type' | 'exclude-element-type';

export interface ViewpointRule {
  readonly code: string;
  readonly kind: ViewpointRuleKind;
  readonly elementType: string;
  readonly severity: ViewpointSeverity;
  readonly actionText: string;
}

export interface ViewpointValidationProfile {
  readonly id: string;
  readonly support: 'supported' | 'unsupported';
  readonly viewpointIds: readonly string[];
  readonly rules: readonly ViewpointRule[];
}

export interface ViewpointValidationRequest {
  readonly model: DeepReadonly<ModelDto>;
  readonly viewId: string;
  readonly viewpointId: string;
  readonly profileId: string;
  readonly profiles: readonly ViewpointValidationProfile[];
}

export interface ViewpointFinding {
  readonly code: string;
  readonly profileCode: string;
  readonly ruleCode: string;
  readonly viewId: string;
  readonly viewpointId: string;
  readonly affectedDtoIds: readonly string[];
  readonly severity: ViewpointSeverity;
  readonly actionText: string;
}

export type ViewpointValidationResult =
  | { readonly status: 'validated'; readonly profileCode: string;
      readonly viewId: string; readonly viewpointId: string;
      readonly findings: readonly ViewpointFinding[] }
  | { readonly status: 'unsupported'; readonly code: 'VIEWPOINT_PROFILE_UNKNOWN' |
      'VIEWPOINT_PROFILE_UNSUPPORTED' | 'VIEWPOINT_UNSUPPORTED';
      readonly profileCode: string; readonly viewId: string; readonly viewpointId: string;
      readonly findings: readonly [] }
  | { readonly status: 'invalid'; readonly code: 'VIEWPOINT_INPUT_INVALID' |
      'VIEWPOINT_MODEL_INVALID' | 'VIEWPOINT_VIEW_NOT_FOUND'; readonly findings: readonly [] };

type InvalidCode = Extract<ViewpointValidationResult, { status: 'invalid' }>['code'];
interface RuleOccurrence { readonly itemId: string; readonly conceptType: string }

const ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const TYPE = /^(?:archimate:)?[A-Za-z][A-Za-z0-9]{0,79}$/;
const MAX_PROFILES = 100;
const MAX_RULES = 200;
const MAX_TEXT = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function isSeverity(value: unknown): value is ViewpointSeverity {
  return value === 'error' || value === 'warning' || value === 'info';
}

function validRule(value: unknown): value is ViewpointRule {
  return isRecord(value) && typeof value.code === 'string' && CODE.test(value.code) &&
    (value.kind === 'require-element-type' || value.kind === 'exclude-element-type') &&
    typeof value.elementType === 'string' && TYPE.test(value.elementType) &&
    isSeverity(value.severity) && typeof value.actionText === 'string' &&
    value.actionText.trim().length > 0 && value.actionText.length <= MAX_TEXT &&
    !/[\u0000-\u001f\u007f]/.test(value.actionText);
}

function validProfile(value: unknown): value is ViewpointValidationProfile {
  if (!isRecord(value) || !isId(value.id) ||
      (value.support !== 'supported' && value.support !== 'unsupported') ||
      !Array.isArray(value.viewpointIds) || value.viewpointIds.length > MAX_PROFILES ||
      !value.viewpointIds.every(isId) || new Set(value.viewpointIds).size !== value.viewpointIds.length ||
      !Array.isArray(value.rules) || value.rules.length > MAX_RULES ||
      !value.rules.every(validRule)) return false;
  const codes = value.rules.map((rule) => (rule as ViewpointRule).code);
  return new Set(codes).size === codes.length;
}

function validRequest(value: unknown): value is ViewpointValidationRequest {
  if (!isRecord(value) || !isId(value.viewId) || !isId(value.viewpointId) ||
      !isId(value.profileId) || !Array.isArray(value.profiles) ||
      value.profiles.length > MAX_PROFILES || !value.profiles.every(validProfile)) return false;
  const ids = value.profiles.map((profile) => (profile as ViewpointValidationProfile).id);
  return new Set(ids).size === ids.length;
}

function collectOccurrences(view: ViewDto, conceptTypes: ReadonlyMap<string, string>): RuleOccurrence[] {
  const result: RuleOccurrence[] = [];
  const visit = (node: ViewNodeDto): void => {
    if (node.kind === 'element' && node.elementId) {
      const conceptType = conceptTypes.get(node.elementId);
      if (conceptType) result.push({ itemId: node.id, conceptType });
    }
    node.nodes.forEach(visit);
  };
  view.nodes.forEach(visit);
  view.connections.forEach((connection) => {
    if (connection.kind === 'relationship' && connection.relationshipId) {
      const conceptType = conceptTypes.get(connection.relationshipId);
      if (conceptType) result.push({ itemId: connection.id, conceptType });
    }
  });
  return result;
}

function makeFinding(
  profile: ViewpointValidationProfile,
  rule: ViewpointRule,
  view: ViewDto,
  viewpointId: string,
  ids: string[]
): ViewpointFinding {
  return { code: `VIEWPOINT_${rule.code}`, profileCode: profile.id, ruleCode: rule.code,
    viewId: view.id, viewpointId, affectedDtoIds: [...new Set(ids)].sort(),
    severity: rule.severity, actionText: rule.actionText };
}

function evaluateRule(
  profile: ViewpointValidationProfile,
  rule: ViewpointRule,
  view: ViewDto,
  viewpointId: string,
  occurrences: readonly RuleOccurrence[]
): ViewpointFinding | undefined {
  const matching = occurrences.filter((item) => item.conceptType === rule.elementType);
  if (rule.kind === 'require-element-type' && matching.length === 0) {
    return makeFinding(profile, rule, view, viewpointId, [view.id]);
  }
  if (rule.kind === 'exclude-element-type' && matching.length > 0) {
    return makeFinding(profile, rule, view, viewpointId, matching.map((item) => item.itemId));
  }
  return undefined;
}

function sortFindings(findings: ViewpointFinding[]): ViewpointFinding[] {
  return findings.sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 :
    left.affectedDtoIds.join('\u0000') < right.affectedDtoIds.join('\u0000') ? -1 :
      left.affectedDtoIds.join('\u0000') > right.affectedDtoIds.join('\u0000') ? 1 : 0);
}

function invalidResult(code: InvalidCode): ViewpointValidationResult {
  return { status: 'invalid', code, findings: [] };
}

/** Applies only caller-supplied rules; it does not establish standards conformance. */
export function validateViewpoint(input: ViewpointValidationRequest): ViewpointValidationResult {
  if (!validRequest(input)) return invalidResult('VIEWPOINT_INPUT_INVALID');

  let model: ModelDto;
  try { model = validateModelDto(input.model); }
  catch { return invalidResult('VIEWPOINT_MODEL_INVALID'); }

  const view = model.views.find((candidate) => candidate.id === input.viewId);
  if (!view) return invalidResult('VIEWPOINT_VIEW_NOT_FOUND');

  const profile = input.profiles.find((candidate) => candidate.id === input.profileId);
  if (!profile) return { status: 'unsupported', code: 'VIEWPOINT_PROFILE_UNKNOWN',
    profileCode: input.profileId, viewId: view.id, viewpointId: input.viewpointId, findings: [] };
  if (profile.support !== 'supported') return { status: 'unsupported',
    code: 'VIEWPOINT_PROFILE_UNSUPPORTED', profileCode: profile.id,
    viewId: view.id, viewpointId: input.viewpointId, findings: [] };
  if (!profile.viewpointIds.includes(input.viewpointId)) return { status: 'unsupported',
    code: 'VIEWPOINT_UNSUPPORTED', profileCode: profile.id,
    viewId: view.id, viewpointId: input.viewpointId, findings: [] };

  const conceptTypes = new Map([...model.elements, ...model.relationships]
    .map((concept) => [concept.id, concept.type]));
  const occurrences = collectOccurrences(view, conceptTypes);
  const findings = profile.rules.map((rule) =>
    evaluateRule(profile, rule, view, input.viewpointId, occurrences))
    .filter((finding): finding is ViewpointFinding => finding !== undefined);
  return { status: 'validated', profileCode: profile.id, viewId: view.id,
    viewpointId: input.viewpointId, findings: sortFindings(findings) };
}
