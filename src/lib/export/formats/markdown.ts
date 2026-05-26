import type { TabularPayload, LongformPayload } from "../types";

export function renderMdTabular(payload: TabularPayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.title}`);
  lines.push("");
  lines.push(`*Generated ${payload.generatedAt} · ${payload.filterSummary}*`);
  lines.push("");
  lines.push("| " + payload.columns.map((c) => c.label).join(" | ") + " |");
  lines.push("| " + payload.columns.map(() => "---").join(" | ") + " |");
  for (const row of payload.rows) {
    lines.push(
      "| " +
        payload.columns
          .map((c) => String(row[c.key] ?? "").replace(/\|/g, "\\|"))
          .join(" | ") +
        " |",
    );
  }
  if (payload.rows.length === 0) {
    lines.push("");
    lines.push("*(no rows)*");
  }
  return lines.join("\n") + "\n";
}

export function renderMdLongform(payload: LongformPayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.title}`);
  lines.push("");
  lines.push(`*Generated ${payload.generatedAt} · ${payload.filterSummary}*`);
  lines.push("");
  for (const section of payload.sections) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    lines.push(section.body);
    lines.push("");
  }
  return lines.join("\n");
}
