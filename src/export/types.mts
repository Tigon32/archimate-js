export type ExportFormat = 'svg' | 'png' | 'pdf';
export type ExportFit = 'none' | 'contain' | 'cover';
export type ExportBackground = 'transparent' | 'white' | 'black' | `#${string}`;
export type ExportPdfPageSize = 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter';
export type ExportPdfOrientation = 'portrait' | 'landscape';

export type ExportRequest = {
  xml: string;
  viewId?: string;
  viewName?: string;
  formats: readonly ExportFormat[];
  scale?: number;
  background?: ExportBackground;
  fit?: ExportFit;
  padding?: number;
  pdfPageSize?: ExportPdfPageSize;
  pdfOrientation?: ExportPdfOrientation;
  pdfTitle?: string;
  pdfFooter?: string;
  signal?: AbortSignal;
};

export type ExportServiceConfig = {
  chrome?: string;
  rendererPath?: string;
  outputDirectory?: string;
};

export type ExportDiagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
};

export type ExportArtifact = {
  format: ExportFormat;
  bytes: string | Uint8Array;
  dimensions: { width: number; height: number };
};

export type ExportResult = {
  valid: true;
  diagnostics: readonly ExportDiagnostic[];
  artifacts: readonly ExportArtifact[];
  canonicalSvg?: string;
};

export type ExportOutcome = ExportResult | { code: string };

export type ExportFileRequest = ExportRequest & {
  basename?: string;
};

export type ExportFileResult = ExportResult & {
  files: readonly string[];
};
