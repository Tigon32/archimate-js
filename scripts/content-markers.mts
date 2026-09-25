import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export type MarkerRule = { id: string; pattern: RegExp };
export type MarkerConfigResult = { rules: MarkerRule[]; invalid: boolean; path?: string };

export const DEFAULT_MARKER_CONFIG_PATH = 'docs/security/content-markers.json';
export const MARKER_CONFIG_ENV = 'ARCHIMATE_CONTENT_MARKERS_FILE';

const MAX_RULES = 64;
const MAX_PATTERN_LENGTH = 200;
const RULE_ID = /^[a-z][a-z0-9-]{2,39}$/;
const ALLOWED_FLAGS = new Set(['', 'i', 'u', 'iu', 'ui']);
const MAX_REPEAT = 16;
// Conservative upper bound on distinct bounded-repeat paths. A repeated group
// raises its inner path count to its maximum repeat count, so nested bounded
// repetitions such as `(?:a?b?){16}` are charged multiplicatively.
const MAX_REPEAT_COMBINATIONS = 4096;

type RawRule = { id?: unknown; pattern?: unknown; flags?: unknown };

type GroupState = {
  alternatives: number;
  startsWithEscapedDelimiter: boolean;
  hasContent: boolean;
  hasUnboundedQuantifier: boolean;
  repeatCombinations: number;
};

type SafePatternState = {
  groups: GroupState[];
  previous: 'atom' | 'group' | 'other';
  previousGroup?: GroupState;
  previousAtomQuantifiable: boolean;
  previousQuantified: boolean;
  unboundedQuantifiers: number;
  choicePoints: number;
  repeatCombinations: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEscape(pattern: string, index: number, state: SafePatternState): number | undefined {
  const escaped = pattern[index + 1] ?? '';
  if (/\d/.test(escaped) || !/^(?:[bBdDsSwW]|[.^$*+?()[\]{}|\\/-])$/.test(escaped)) return undefined;
  const group = state.groups.at(-1);
  if (group) {
    if (!group.hasContent) group.startsWithEscapedDelimiter = escaped === '.';
    group.hasContent = true;
  }
  state.previous = 'atom';
  state.previousAtomQuantifiable = !/[bB]/.test(escaped);
  state.previousGroup = undefined;
  state.previousQuantified = false;
  return index + 1;
}

function readCharacterClass(pattern: string, index: number, state: SafePatternState): number | undefined {
  const end = pattern.indexOf(']', index + 1);
  if (end < 0 || end === index + 1 || pattern.slice(index + 1, end).includes('[')) return undefined;
  const group = state.groups.at(-1);
  if (group) group.hasContent = true;
  state.previous = 'atom';
  state.previousAtomQuantifiable = true;
  state.previousGroup = undefined;
  state.previousQuantified = false;
  return end;
}

function openGroup(pattern: string, index: number, state: SafePatternState): boolean {
  if (!pattern.startsWith('(?:', index)) return false;
  const parent = state.groups.at(-1);
  if (parent) parent.hasContent = true;
  state.groups.push({
    alternatives: 0, startsWithEscapedDelimiter: false, hasContent: false, hasUnboundedQuantifier: false,
    repeatCombinations: 1
  });
  state.previous = 'other';
  state.previousAtomQuantifiable = false;
  state.previousGroup = undefined;
  state.previousQuantified = false;
  return true;
}

function chargeRepeats(state: SafePatternState, factor: number): boolean {
  const owner = state.groups.at(-1) ?? state;
  owner.repeatCombinations *= factor;
  return Number.isFinite(owner.repeatCombinations) && owner.repeatCombinations <= MAX_REPEAT_COMBINATIONS;
}

function closeGroup(state: SafePatternState): boolean {
  const group = state.groups.pop();
  if (!group || !chargeRepeats(state, group.repeatCombinations)) return false;
  const parent = state.groups.at(-1);
  if (parent) {
    parent.alternatives += group.alternatives;
    parent.hasUnboundedQuantifier ||= group.hasUnboundedQuantifier;
  }
  state.previous = 'group';
  state.previousAtomQuantifiable = false;
  state.previousGroup = group;
  state.previousQuantified = false;
  return true;
}

function readQuantifier(pattern: string, index: number, state: SafePatternState): number | undefined {
  const character = pattern[index] ?? '';
  let minimum = 0;
  let maximum = 0;
  let nextIndex = index;
  if (character === '{') {
    const match = /^\{(\d+)(?:,(\d+))?\}/.exec(pattern.slice(index));
    if (!match) return undefined;
    minimum = Number(match[1]);
    maximum = match[2] === undefined ? minimum : Number(match[2]);
    if (maximum < minimum || maximum > MAX_REPEAT) return undefined;
    nextIndex += match[0].length - 1;
  } else if (character === '?') {
    maximum = 1;
  } else {
    maximum = Number.POSITIVE_INFINITY;
    if (++state.unboundedQuantifiers > 2) return undefined;
    if (state.unboundedQuantifiers > 1
      && !state.groups.some(group => group.startsWithEscapedDelimiter && !group.hasUnboundedQuantifier)) return undefined;
  }
  if (state.previous === 'other' || state.previousQuantified
    || state.previous === 'atom' && !state.previousAtomQuantifiable) return undefined;

  if (state.previous === 'group') {
    const group = state.previousGroup;
    if (!group || maximum > 1 && group.alternatives > 0) return undefined;
    if (group.hasUnboundedQuantifier) return undefined;
    if (maximum === Number.POSITIVE_INFINITY) return undefined;
    // The group's inner paths were charged once on close; charge the remaining repetitions.
    if (!chargeRepeats(state, group.repeatCombinations ** Math.max(maximum - 1, 0))) return undefined;
  }
  if (maximum !== Number.POSITIVE_INFINITY && !chargeRepeats(state, maximum - minimum + 1)) return undefined;
  const parent = state.groups.at(-1);
  if (parent) {
    parent.hasUnboundedQuantifier ||= maximum === Number.POSITIVE_INFINITY;
  }
  state.previousQuantified = true;
  state.previousAtomQuantifiable = false;
  state.previousGroup = undefined;
  return nextIndex;
}

function isSafePattern(pattern: string): boolean {
  const state: SafePatternState = {
    groups: [], previous: 'other', previousAtomQuantifiable: false, previousQuantified: false,
    unboundedQuantifiers: 0, choicePoints: 0, repeatCombinations: 1
  };
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index] ?? '';
    if (character === '\\') {
      const end = readEscape(pattern, index, state);
      if (end === undefined) return false;
      index = end;
    } else if (character === '[') {
      const end = readCharacterClass(pattern, index, state);
      if (end === undefined) return false;
      index = end;
    } else if (character === '(') {
      if (!openGroup(pattern, index, state)) return false;
      index += 2;
    } else if (character === ')') {
      if (!closeGroup(state)) return false;
    } else if (character === '|') {
      if (!state.groups.length || ++state.choicePoints > 16) return false;
      state.groups.at(-1)!.alternatives++;
      state.previous = 'other';
      state.previousAtomQuantifiable = false;
      state.previousGroup = undefined;
      state.previousQuantified = false;
    } else if ('*+?{'.includes(character)) {
      const end = readQuantifier(pattern, index, state);
      if (end === undefined) return false;
      index = end;
    } else if (character === '^' || character === '$') {
      const group = state.groups.at(-1);
      if (group) group.hasContent = true;
      state.previous = 'other';
      state.previousAtomQuantifiable = false;
      state.previousGroup = undefined;
      state.previousQuantified = false;
    } else {
      const group = state.groups.at(-1);
      if (group) group.hasContent = true;
      state.previous = 'atom';
      state.previousAtomQuantifiable = character !== '.';
      state.previousGroup = undefined;
      state.previousQuantified = false;
    }
  }
  return state.groups.length === 0;
}

function compileRule(raw: RawRule, seen: Set<string>): MarkerRule | undefined {
  if (typeof raw.id !== 'string' || !RULE_ID.test(raw.id) || seen.has(raw.id)) return undefined;
  if (typeof raw.pattern !== 'string' || !raw.pattern || raw.pattern.length > MAX_PATTERN_LENGTH
    || !isSafePattern(raw.pattern)) return undefined;
  const flags = raw.flags === undefined ? '' : raw.flags;
  if (typeof flags !== 'string' || !ALLOWED_FLAGS.has(flags)) return undefined;
  try {
    const rule = { id: raw.id, pattern: new RegExp(raw.pattern, flags) };
    seen.add(raw.id);
    return rule;
  } catch {
    return undefined;
  }
}

/**
 * Compiles a marker-rule document. Invalid documents fail closed: they report
 * `invalid` without disclosing the offending pattern text.
 */
export function compileMarkerRules(config: unknown): MarkerConfigResult {
  if (!isRecord(config) || config.version !== 1 || !Array.isArray(config.rules)) return { rules: [], invalid: true };
  if (config.rules.length > MAX_RULES) return { rules: [], invalid: true };

  const seen = new Set<string>();
  const rules: MarkerRule[] = [];
  for (const entry of config.rules) {
    if (!isRecord(entry)) return { rules: [], invalid: true };
    const rule = compileRule(entry, seen);
    if (!rule) return { rules: [], invalid: true };
    rules.push(rule);
  }
  rules.sort((left, right) => left.id.localeCompare(right.id));
  return { rules, invalid: false };
}

function readConfigFile(path: string): unknown {
  if (!lstatSync(path).isFile()) throw new Error('marker config is not a regular file');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Loads organization/private-data marker rules. The tracked default file holds
 * only generic public patterns; private organization markers belong in an
 * untracked local file referenced by `ARCHIMATE_CONTENT_MARKERS_FILE`.
 */
export function loadMarkerRules(root: string, env: NodeJS.ProcessEnv = process.env): MarkerConfigResult {
  const override = env[MARKER_CONFIG_ENV]?.trim();
  const path = override ? (isAbsolute(override) ? override : resolve(root, override)) : resolve(root, DEFAULT_MARKER_CONFIG_PATH);
  let config: unknown;
  try {
    config = readConfigFile(path);
  } catch {
    return { rules: [], invalid: true, path };
  }
  return { ...compileMarkerRules(config), path };
}
