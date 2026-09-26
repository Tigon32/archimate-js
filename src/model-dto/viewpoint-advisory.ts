import { DiagramAdapter } from './editor.js';
import { validateViewpoint } from './viewpoint-validation.js';
import type { EditorCommand } from './editor.js';
import type { ModelDto, ViewConnectionDto, ViewNodeDto } from './types.js';
import type {
  ViewpointFinding, ViewpointSeverity, ViewpointValidationProfile, ViewpointValidationResult
} from './viewpoint-validation.js';

export type ViewpointAdvisoryMode = 'advisory' | 'strict';
export type ViewpointAdvisoryStatus = ViewpointValidationResult['status'];

export interface ViewpointAdvisoryFinding {
  readonly code: string;
  readonly profileCode: string;
  readonly ruleCode: string;
  readonly viewId: string;
  readonly viewpointId: string;
  readonly affectedDtoIds: readonly string[];
  readonly affectedConceptIds: readonly string[];
  readonly severity: ViewpointSeverity;
  readonly actionText: string;
}

export interface ViewpointAdvisorySnapshot {
  readonly mode: ViewpointAdvisoryMode;
  readonly status: ViewpointAdvisoryStatus;
  readonly code?: string;
  readonly profileCode: string;
  readonly viewId: string;
  readonly viewpointId: string;
  readonly findings: readonly ViewpointAdvisoryFinding[];
  readonly blocking: boolean;
}

export interface ViewpointAdvisoryOptions {
  readonly adapter: DiagramAdapter;
  readonly viewId: string;
  readonly viewpointId: string;
  readonly profile: ViewpointValidationProfile;
  readonly strict?: boolean;
}

export type ViewpointAdvisoryCommandResult =
  | { readonly status: 'applied'; readonly snapshot: ViewpointAdvisorySnapshot }
  | { readonly status: 'blocked'; readonly snapshot: ViewpointAdvisorySnapshot };

export interface ViewpointAdvisoryService {
  getSnapshot(): ViewpointAdvisorySnapshot;
  subscribe(listener: (snapshot: ViewpointAdvisorySnapshot) => void): () => void;
  execute(command: EditorCommand): ViewpointAdvisoryCommandResult;
  dispose(): void;
}

function conceptIds(model: ModelDto, viewId: string): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const visit = (node: ViewNodeDto): void => {
    if (node.elementId) ids.set(node.id, node.elementId);
    node.nodes.forEach(visit);
  };
  const view = model.views.find((item) => item.id === viewId);
  view?.nodes.forEach(visit);
  view?.connections.forEach((connection: ViewConnectionDto) => {
    if (connection.relationshipId) ids.set(connection.id, connection.relationshipId);
  });
  return ids;
}

function findingOf(source: ViewpointFinding,
  ids: ReadonlyMap<string, string>): ViewpointAdvisoryFinding {
  const affectedConceptIds = [...new Set(source.affectedDtoIds
    .map((id) => ids.get(id))
    .filter((id): id is string => id !== undefined))].sort();
  return { code: source.code, profileCode: source.profileCode, ruleCode: source.ruleCode,
    viewId: source.viewId, viewpointId: source.viewpointId,
    affectedDtoIds: [...source.affectedDtoIds], affectedConceptIds,
    severity: source.severity, actionText: source.actionText };
}

function resultCode(result: ViewpointValidationResult): string | undefined {
  return result.status === 'validated' ? undefined : result.code;
}

function profileCode(result: ViewpointValidationResult, fallback: string): string {
  return result.status === 'invalid' ? fallback : result.profileCode;
}

function snapshotClone(snapshot: ViewpointAdvisorySnapshot): ViewpointAdvisorySnapshot {
  return structuredClone(snapshot);
}

function strictBlockingSnapshot(
  mode: ViewpointAdvisoryMode,
  command: EditorCommand,
  options: ViewpointAdvisoryOptions,
  evaluate: (model: ModelDto) => ViewpointAdvisorySnapshot
): ViewpointAdvisorySnapshot | undefined {
  if (mode !== 'strict' || command.viewId !== options.viewId) return undefined;
  const candidate = new DiagramAdapter(options.adapter.getModel(), {
    semanticProfile: options.adapter.getSemanticProfile()
  });
  candidate.execute(command);
  const preview = evaluate(candidate.getModel());
  return preview.blocking ? preview : undefined;
}

export function createViewpointAdvisoryService(
  options: ViewpointAdvisoryOptions
): ViewpointAdvisoryService {
  const profile = structuredClone(options.profile);
  const mode: ViewpointAdvisoryMode = options.strict === true ? 'strict' : 'advisory';
  const listeners = new Set<(snapshot: ViewpointAdvisorySnapshot) => void>();
  let disposed = false;
  let snapshot = evaluate(options.adapter.getModel());

  function evaluate(model: ModelDto): ViewpointAdvisorySnapshot {
    const result = validateViewpoint({ model, viewId: options.viewId,
      viewpointId: options.viewpointId, profileId: profile.id, profiles: [profile] });
    const findings = result.status === 'validated'
      ? result.findings.map((finding) => findingOf(finding, conceptIds(model, options.viewId)))
      : [];
    return { mode, status: result.status, code: resultCode(result),
      profileCode: profileCode(result, profile.id), viewId: options.viewId,
      viewpointId: options.viewpointId, findings,
      blocking: mode === 'strict' && findings.some((finding) => finding.severity === 'error') };
  }

  function publish(next: ViewpointAdvisorySnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener(snapshotClone(snapshot));
  }

  const unsubscribe = options.adapter.subscribe((event) => {
    if (!disposed && event.type === 'changed' && event.viewId === options.viewId) {
      publish(evaluate(event.model));
    }
  });

  return {
    getSnapshot: () => snapshotClone(snapshot),
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    execute: (command) => {
      const blocked = strictBlockingSnapshot(mode, command, options, evaluate);
      if (blocked) return { status: 'blocked', snapshot: snapshotClone(blocked) };
      options.adapter.execute(command);
      return { status: 'applied', snapshot: snapshotClone(snapshot) };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      listeners.clear();
    }
  };
}
