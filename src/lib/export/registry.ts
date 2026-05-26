/**
 * Domain and format registry — what's allowed, what's implemented.
 */

import type { ExportDomain, ExportFormat } from "./types";

export interface DomainSpec {
  key: ExportDomain;
  label: string;
  description: string;
  shape: "tabular" | "longform" | "mixed";
  allowedFormats: ExportFormat[];
  statusOptions: string[]; // domain-specific filter chip values
  implemented: boolean;
}

export const DOMAINS: DomainSpec[] = [
  {
    key: "keywords",
    label: "Keywords",
    description: "Research Agent output — keyword, score, source, status",
    shape: "tabular",
    allowedFormats: ["xlsx", "csv", "pdf"],
    statusOptions: ["researched", "approved", "in-progress", "published", "shelved"],
    implemented: true,
  },
  {
    key: "runs",
    label: "Run history",
    description: "Telemetry — agent, timestamp, status, duration, action",
    shape: "tabular",
    allowedFormats: ["xlsx", "csv", "pdf"],
    statusOptions: ["running", "success", "failure"],
    implemented: true,
  },
  {
    key: "articles",
    label: "Articles",
    description: "Drafts — title, body, meta. (Wires up once Content Writing lands.)",
    shape: "longform",
    allowedFormats: ["docx", "pdf", "md", "txt"],
    statusOptions: ["draft", "qa-passed", "approved", "published"],
    implemented: false,
  },
  {
    key: "performance",
    label: "Performance",
    description: "Rank / CTR / impressions per URL. (Wires up once GSC connects.)",
    shape: "tabular",
    allowedFormats: ["xlsx", "csv", "pdf"],
    statusOptions: [],
    implemented: false,
  },
  {
    key: "logs",
    label: "Logs",
    description: "Raw application log lines.",
    shape: "longform",
    allowedFormats: ["txt", "pdf"],
    statusOptions: ["info", "warning", "error"],
    implemented: false,
  },
  {
    key: "full-report",
    label: "Full report",
    description: "Everything within a date range — one cohesive document.",
    shape: "mixed",
    allowedFormats: ["pdf", "docx"],
    statusOptions: [],
    implemented: false,
  },
];

export function findDomain(key: string): DomainSpec | undefined {
  return DOMAINS.find((d) => d.key === key);
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV (.csv)",
  xlsx: "Excel (.xlsx)",
  pdf: "PDF (.pdf)",
  docx: "Word (.docx)",
  md: "Markdown (.md)",
  txt: "Plain text (.txt)",
};

export const FORMAT_MIME: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export const FORMAT_EXT: Record<ExportFormat, string> = {
  csv: "csv",
  xlsx: "xlsx",
  pdf: "pdf",
  docx: "docx",
  md: "md",
  txt: "txt",
};
