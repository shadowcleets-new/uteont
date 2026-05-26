import type { TabularPayload, LongformPayload } from "../types";

export function renderTextTabular(payload: TabularPayload): string {
  const lines: string[] = [];
  lines.push(payload.title);
  lines.push(`Generated ${payload.generatedAt} · ${payload.filterSummary}`);
  lines.push("");

  const widths = payload.columns.map((c) =>
    Math.max(
      c.label.length,
      ...payload.rows.map((r) => String(r[c.key] ?? "").length),
    ),
  );

  const fmt = (cells: string[]) =>
    cells.map((s, i) => s.padEnd(widths[i])).join("  ");

  lines.push(fmt(payload.columns.map((c) => c.label)));
  lines.push(fmt(widths.map((w) => "-".repeat(w))));
  for (const row of payload.rows) {
    lines.push(fmt(payload.columns.map((c) => String(row[c.key] ?? ""))));
  }
  if (payload.rows.length === 0) {
    lines.push("(no rows)");
  }
  return lines.join("\n") + "\n";
}

export function renderTextLongform(payload: LongformPayload): string {
  const lines: string[] = [];
  lines.push(payload.title);
  lines.push("=".repeat(Math.max(8, payload.title.length)));
  lines.push(`Generated ${payload.generatedAt} · ${payload.filterSummary}`);
  lines.push("");
  for (const section of payload.sections) {
    lines.push(section.heading);
    lines.push("-".repeat(Math.max(4, section.heading.length)));
    lines.push("");
    lines.push(section.body);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
