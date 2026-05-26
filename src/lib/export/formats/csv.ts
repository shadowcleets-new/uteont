import type { TabularPayload } from "../types";

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function renderCsv(payload: TabularPayload): string {
  const header = payload.columns.map((c) => escape(c.label)).join(",");
  const lines = payload.rows.map((row) =>
    payload.columns.map((c) => escape(row[c.key])).join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
