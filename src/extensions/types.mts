import type { PropertyDefinitionDto } from '../model-dto/types.js';
import type { LintRule } from '../lint/types.mjs';

export const EXTENSION_API_VERSION = '0.1.0' as const;
export const EXTENSION_MANIFEST_VERSION = 1 as const;

export interface ArchimateExtensionContext {
  readonly apiVersion: typeof EXTENSION_API_VERSION;
}

export type ExtensionDisposer = () => void | Promise<void>;

export interface ArchimateExtension {
  readonly manifestVersion: typeof EXTENSION_MANIFEST_VERSION;
  readonly id: string;
  readonly version: string;
  readonly compatibleApi: string;
  readonly contributions?: {
    readonly propertySchemas?: readonly PropertyDefinitionDto[];
    readonly lintRules?: readonly LintRule[];
  };
  readonly initialize?: (context: ArchimateExtensionContext) =>
    void | ExtensionDisposer | Promise<void | ExtensionDisposer>;
}

export type ExtensionDiagnosticCode =
  | 'EXTENSION_MANIFEST_INVALID'
  | 'EXTENSION_API_INCOMPATIBLE'
  | 'EXTENSION_ID_DUPLICATE'
  | 'EXTENSION_CONTRIBUTION_ID_DUPLICATE'
  | 'EXTENSION_CONTRIBUTION_CONFLICT';

export interface ExtensionDiagnostic {
  readonly code: ExtensionDiagnosticCode;
  readonly message: string;
  readonly extensionIndex: number;
  readonly contributionIndex?: number;
}

export interface ExtensionRegistrationResult {
  readonly registered: boolean;
  readonly diagnostics: readonly ExtensionDiagnostic[];
}

export interface ExtensionRegistry {
  readonly propertySchemas: readonly PropertyDefinitionDto[];
  readonly lintRules: readonly LintRule[];
  readonly extensionIds: readonly string[];
  register(input: unknown): ExtensionRegistrationResult;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

export type ExtensionLifecycleErrorCode =
  | 'EXTENSION_INITIALIZATION_FAILED'
  | 'EXTENSION_DISPOSAL_FAILED';

export class ExtensionLifecycleError extends Error {
  readonly code: ExtensionLifecycleErrorCode;
  readonly extensionId?: string;
  readonly errors: readonly unknown[];

  constructor(code: ExtensionLifecycleErrorCode, errors: readonly unknown[],
    extensionId?: string) {
    super(code === 'EXTENSION_INITIALIZATION_FAILED'
      ? 'One or more local extensions failed to initialize.'
      : 'One or more local extensions failed to dispose.');
    this.name = 'ExtensionLifecycleError';
    this.code = code;
    this.extensionId = extensionId;
    this.errors = Object.freeze([...errors]);
  }
}
