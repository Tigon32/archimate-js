export type ExportFormat = 'svg' | 'png' | 'pdf';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfPageSize = 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter';
export type FitMode = 'none' | 'contain' | 'cover';

export type ViewSelection = {
  viewId?: string;
  viewName?: string;
};

export type ValidateOptions = {
  command: 'validate';
  input: string;
};

export type RenderOptions = ViewSelection & {
  command: 'render';
  input: string;
  output: string;
  chrome?: string;
};

export type ExportOptions = ViewSelection & {
  command: 'export';
  input: string;
  outputDirectory: string;
  basename: string;
  formats: ExportFormat[];
  scale: number;
  background: string;
  pdfPageSize: PdfPageSize;
  pdfOrientation: PdfOrientation;
  fit: FitMode;
  padding: number;
  pdfTitle?: string;
  pdfFooter?: string;
  chrome?: string;
  allViews?: boolean;
};

export type CliOptions = ValidateOptions | RenderOptions | ExportOptions | { command: 'help' };

export type CliDiagnostic = {
  code: string;
  severity: 'error';
  layer: 'cli';
  message: string;
};

export type CliResult = {
  command: string;
  valid: boolean;
  diagnostics: Array<CliDiagnostic | {
    code: string;
    severity: 'error' | 'warning' | 'info';
    layer: string;
    message: string;
    line?: number;
    column?: number;
  }>;
  suggestions: Array<{
    code: string;
    message: string;
    operation: 'review-reference' | 'review-type' | 'review-model';
  }>;
  formats?: ExportFormat[];
};

export type ExportArtifacts = Partial<Record<ExportFormat, string | Uint8Array>>;
