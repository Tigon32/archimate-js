export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticLayer = 'xml' | 'schema' | 'structure' | 'semantics' | 'quality';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  layer: DiagnosticLayer;
  message: string;
  line?: number;
  column?: number;
  subjectId?: string;
}

export interface RepairSuggestion {
  code: string;
  subjectId?: string;
  message: string;
  /** Suggestions are descriptive only. The validator never changes source XML. */
  operation: 'review-reference' | 'review-type' | 'review-model';
}

export interface ModelSummary {
  elements: ReadonlyArray<{ id: string; type: string }>;
  relationships: ReadonlyArray<{ id: string; type: string; source: string; target: string }>;
  views: ReadonlyArray<{ id: string }>;
  referencedElementIds: ReadonlySet<string>;
}

export interface OrganizationRule {
  code: string;
  message: string;
  check(model: ModelSummary): boolean;
}

export interface ValidatorOptions {
  maxXmlBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  /** Expose identifiers in diagnostics and suggestions only when the caller opts in. */
  includeSubjectIds?: boolean;
  /** Return model identifiers and references only when the caller opts in. */
  includeSummary?: boolean;
  organizationRules?: ReadonlyArray<OrganizationRule>;
}

export interface ValidationResult {
  diagnostics: Diagnostic[];
  suggestions: RepairSuggestion[];
  summary?: ModelSummary;
  valid: boolean;
}
