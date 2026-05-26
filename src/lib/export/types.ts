/**
 * Shared types for the export subsystem.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf" | "docx" | "md" | "txt";

export type ExportDomain =
  | "keywords"
  | "articles"
  | "runs"
  | "performance"
  | "logs"
  | "full-report";

export interface ExportFilters {
  from?: string;       // ISO date inclusive
  to?: string;         // ISO date inclusive
  statuses?: string[]; // domain-specific status filter
}

export interface ExportRequest {
  domain: ExportDomain;
  format: ExportFormat;
  filters: ExportFilters;
}

/**
 * A normalized export payload — either tabular (rows + columns) or
 * long-form (sections of text). Format adapters consume this.
 */
export interface TabularPayload {
  kind: "tabular";
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  generatedAt: string;
  filterSummary: string;
}

export interface LongformSection {
  heading: string;
  body: string; // markdown-ish; format adapter renders appropriately
}

export interface LongformPayload {
  kind: "longform";
  title: string;
  sections: LongformSection[];
  generatedAt: string;
  filterSummary: string;
}

export type ExportPayload = TabularPayload | LongformPayload;

export interface ExportFile {
  filename: string;
  mimeType: string;
  body: Buffer | Uint8Array | string;
}
