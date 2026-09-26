import type { PropertyDefinitionDto, PropertyDefinitionType } from '../model-dto/types.js';
import type { LintRule } from '../lint/types.mjs';
import { isCompatibilityRange, isCompatible, isVersion } from './compatibility.mjs';
import {
  EXTENSION_API_VERSION, EXTENSION_MANIFEST_VERSION, ExtensionLifecycleError
} from './types.mjs';
import type {
  ArchimateExtension, ExtensionDiagnostic, ExtensionRegistrationResult,
  ExtensionRegistry
} from './types.mjs';

const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const LINT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)?$/;
const PROPERTY_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const PROPERTY_TYPES = new Set<PropertyDefinitionType>(['string', 'boolean', 'integer', 'real']);
const MESSAGES = Object.freeze({
  EXTENSION_MANIFEST_INVALID: 'Extension manifest is malformed.',
  EXTENSION_API_INCOMPATIBLE: 'Extension API range is incompatible with this host.',
  EXTENSION_ID_DUPLICATE: 'Extension identity is already registered.',
  EXTENSION_CONTRIBUTION_ID_DUPLICATE: 'Contribution identity is already registered.',
  EXTENSION_CONTRIBUTION_CONFLICT: 'Contributions conflict with an existing contribution.'
});

interface RegisteredExtension {
  readonly manifest: ArchimateExtension;
  readonly propertySchemas: readonly PropertyDefinitionDto[];
  readonly lintRules: readonly LintRule[];
}

type State = 'registering' | 'initializing' | 'initialized' | 'disposing' | 'disposed';
type DisposerEntry = { id: string; dispose: () => void | Promise<void> };

class ExtensionRegistryImpl implements ExtensionRegistry {
  readonly #extensions = new Map<string, RegisteredExtension>();
  readonly #disposers: DisposerEntry[] = [];
  #state: State = 'registering';

  get propertySchemas(): readonly PropertyDefinitionDto[] {
    return Object.freeze([...this.#extensions.values()]
      .flatMap(({ propertySchemas }) => propertySchemas)
      .sort((left, right) => compare(left.id, right.id)));
  }

  get lintRules(): readonly LintRule[] {
    return Object.freeze([...this.#extensions.values()].flatMap(({ lintRules }) => lintRules)
      .sort((left, right) => compare(left.id, right.id)));
  }

  get extensionIds(): readonly string[] {
    return Object.freeze([...this.#extensions.keys()].sort(compare));
  }

  register(input: unknown): ExtensionRegistrationResult {
    if (this.#state !== 'registering') {
      throw new Error('Extensions can only be registered before initialization.');
    }
    const parsed = parseManifest(input);
    if (!parsed.manifest) return failed(parsed.diagnostics);
    if (!isCompatible(parsed.manifest.manifest.compatibleApi, EXTENSION_API_VERSION)) {
      return failed([diagnostic('EXTENSION_API_INCOMPATIBLE', parsed.index)]);
    }
    if (this.#extensions.has(parsed.manifest.manifest.id)) {
      return failed([diagnostic('EXTENSION_ID_DUPLICATE', parsed.index)]);
    }
    const conflict = findContributionDiagnostic(parsed.manifest, this.#extensions);
    if (conflict) return failed([diagnostic(conflict.code, parsed.index, conflict.index)]);
    this.#extensions.set(parsed.manifest.manifest.id, parsed.manifest);
    return Object.freeze({ registered: true, diagnostics: Object.freeze([]) });
  }

  async initialize(): Promise<void> {
    if (this.#state !== 'registering') {
      throw new Error('Extension registry can only be initialized once.');
    }
    this.#state = 'initializing';
    for (const [id, extension] of [...this.#extensions]
      .sort(([left], [right]) => compare(left, right))) {
      try {
        const dispose = await extension.manifest.initialize?.(
          Object.freeze({ apiVersion: EXTENSION_API_VERSION }));
        if (dispose !== undefined) this.#disposers.push({ id, dispose });
      } catch (error) {
        await this.rollbackInitialization(error, id);
      }
    }
    this.#state = 'initialized';
  }

  async dispose(): Promise<void> {
    if (this.#state === 'disposed') return;
    if (this.#state === 'initializing' || this.#state === 'disposing') {
      throw new Error('Extension registry cannot be disposed during a lifecycle operation.');
    }
    this.#state = 'disposing';
    const errors = await disposeInitialized(this.#disposers);
    this.#state = 'disposed';
    if (errors.length) throw new ExtensionLifecycleError('EXTENSION_DISPOSAL_FAILED', errors);
  }

  private async rollbackInitialization(error: unknown, extensionId: string): Promise<never> {
    const rollbackErrors = await disposeInitialized(this.#disposers);
    this.#state = 'disposed';
    throw new ExtensionLifecycleError('EXTENSION_INITIALIZATION_FAILED',
      [error, ...rollbackErrors], extensionId);
  }
}

export function createExtensionRegistry(): ExtensionRegistry {
  return Object.freeze(new ExtensionRegistryImpl());
}

function parseManifest(input: unknown): {
  manifest?: RegisteredExtension; diagnostics: readonly ExtensionDiagnostic[]; index: number;
} {
  const index = 0;
  try {
    if (!record(input)) return { diagnostics: [diagnostic('EXTENSION_MANIFEST_INVALID', index)], index };
    const data = input as Record<string, unknown>;
    if (!exactKeys(data, ['manifestVersion', 'id', 'version', 'compatibleApi', 'contributions', 'initialize']) ||
        data.manifestVersion !== EXTENSION_MANIFEST_VERSION || typeof data.id !== 'string' ||
        !ID.test(data.id) || !isVersion(data.version) || !isCompatibilityRange(data.compatibleApi) ||
        data.initialize !== undefined && typeof data.initialize !== 'function') {
      return { diagnostics: [diagnostic('EXTENSION_MANIFEST_INVALID', index)], index };
    }
    const contributionResult = parseContributions(data.contributions);
    if (contributionResult === false) {
      return { diagnostics: [diagnostic('EXTENSION_MANIFEST_INVALID', index)], index };
    }
    const contributions = data.contributions === undefined ? undefined : contributionResult;
    const manifest: ArchimateExtension = Object.freeze({
      manifestVersion: EXTENSION_MANIFEST_VERSION,
      id: data.id,
      version: data.version,
      compatibleApi: data.compatibleApi,
      ...(contributions === undefined ? {} : { contributions }),
      ...(data.initialize === undefined ? {} : { initialize: data.initialize as ArchimateExtension['initialize'] })
    });
    return {
      manifest: Object.freeze({ manifest, propertySchemas: contributions?.propertySchemas ?? [],
        lintRules: contributions?.lintRules ?? [] }),
      diagnostics: Object.freeze([]),
      index
    };
  } catch {
    return { diagnostics: [diagnostic('EXTENSION_MANIFEST_INVALID', index)], index };
  }
}

function parseContributions(input: unknown): ArchimateExtension['contributions'] | undefined | false {
  if (input === undefined) return undefined;
  if (!record(input)) return false;
  const data = input as Record<string, unknown>;
  if (!exactKeys(data, ['propertySchemas', 'lintRules'])) return false;
  const propertySchemas = data.propertySchemas === undefined ? undefined
    : parsePropertySchemas(data.propertySchemas);
  const lintRules = data.lintRules === undefined ? undefined : parseLintRules(data.lintRules);
  if (propertySchemas === false || lintRules === false) return false;
  return Object.freeze({
    ...(propertySchemas === undefined ? {} : { propertySchemas }),
    ...(lintRules === undefined ? {} : { lintRules })
  });
}

function parsePropertySchemas(input: unknown): readonly PropertyDefinitionDto[] | false {
  if (!Array.isArray(input)) return false;
  const result: PropertyDefinitionDto[] = [];
  for (const item of input) {
    if (!record(item)) return false;
    const data = item as Record<string, unknown>;
    const name = data.name;
    const documentation = data.documentation;
    if (!exactKeys(data, ['id', 'type', 'name', 'documentation']) ||
        typeof data.id !== 'string' || !PROPERTY_ID.test(data.id) ||
        typeof data.type !== 'string' || !PROPERTY_TYPES.has(data.type as PropertyDefinitionType) ||
        !optionalText(name) || !optionalText(documentation)) return false;
    result.push(Object.freeze({ id: data.id, type: data.type as PropertyDefinitionType,
      ...(name === undefined ? {} : { name }),
      ...(documentation === undefined ? {} : { documentation }) }));
  }
  return Object.freeze(result);
}

function parseLintRules(input: unknown): readonly LintRule[] | false {
  if (!Array.isArray(input)) return false;
  const result: LintRule[] = [];
  for (const item of input) {
    if (!record(item)) return false;
    const data = item as Record<string, unknown>;
    if (!exactKeys(data, ['id', 'evaluate']) || typeof data.id !== 'string' ||
        !LINT_ID.test(data.id) || typeof data.evaluate !== 'function') return false;
    result.push(Object.freeze({ id: data.id, evaluate: data.evaluate as LintRule['evaluate'] }));
  }
  return Object.freeze(result);
}

function findContributionDiagnostic(
  manifest: RegisteredExtension,
  extensions: ReadonlyMap<string, RegisteredExtension>
): { code: 'EXTENSION_CONTRIBUTION_ID_DUPLICATE' | 'EXTENSION_CONTRIBUTION_CONFLICT'; index: number } | undefined {
  const existingSchemas = new Set([...extensions.values()].flatMap(({ propertySchemas }) =>
    propertySchemas.map(({ id }) => id)));
  const existingRules = new Set([...extensions.values()].flatMap(({ lintRules }) =>
    lintRules.map(({ id }) => id)));
  const incoming = [
    ...manifest.propertySchemas.map(({ id }, index) => ({ id, kind: 'schema' as const, index })),
    ...manifest.lintRules.map(({ id }, index) => ({ id, kind: 'rule' as const, index }))
  ].sort((left, right) => compare(left.id, right.id) || compare(left.kind, right.kind));
  const seenSchemas = new Set<string>();
  const seenRules = new Set<string>();
  for (const contribution of incoming) {
    const sameKind = contribution.kind === 'schema' ? seenSchemas : seenRules;
    const otherKind = contribution.kind === 'schema' ? seenRules : seenSchemas;
    const existingSameKind = contribution.kind === 'schema' ? existingSchemas : existingRules;
    const existingOtherKind = contribution.kind === 'schema' ? existingRules : existingSchemas;
    if (otherKind.has(contribution.id) || existingOtherKind.has(contribution.id)) {
      return { code: 'EXTENSION_CONTRIBUTION_CONFLICT', index: contribution.index };
    }
    if (sameKind.has(contribution.id) || existingSameKind.has(contribution.id)) {
      return { code: 'EXTENSION_CONTRIBUTION_ID_DUPLICATE', index: contribution.index };
    }
    sameKind.add(contribution.id);
  }
  return undefined;
}

async function disposeInitialized(
  disposers: DisposerEntry[]
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const entry of disposers.splice(0).reverse()) {
    try {
      await entry.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function diagnostic(code: ExtensionDiagnostic['code'], extensionIndex: number,
  contributionIndex?: number): ExtensionDiagnostic {
  return Object.freeze({ code, message: MESSAGES[code], extensionIndex,
    ...(contributionIndex === undefined ? {} : { contributionIndex }) });
}

function failed(diagnostics: readonly ExtensionDiagnostic[]): ExtensionRegistrationResult {
  return Object.freeze({ registered: false, diagnostics: Object.freeze([...diagnostics]) });
}

function record(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(data: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(data).every((key) => allowed.includes(key));
}

function optionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string' && value.length <= 65536;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
