import { NextRequest, NextResponse } from "next/server";
import { renderCsv } from "@/lib/export/formats/csv";
import { renderXlsx } from "@/lib/export/formats/xlsx";
import { renderPdfTabular, renderPdfLongform } from "@/lib/export/formats/pdf";
import { renderDocxTabular, renderDocxLongform } from "@/lib/export/formats/docx";
import { renderTextTabular, renderTextLongform } from "@/lib/export/formats/text";
import { renderMdTabular, renderMdLongform } from "@/lib/export/formats/markdown";
import { fetchKeywordsPayload } from "@/lib/export/domains/keywords";
import { fetchRunsPayload } from "@/lib/export/domains/runs";
import { findDomain, FORMAT_EXT, FORMAT_MIME } from "@/lib/export/registry";
import type {
  ExportDomain, ExportFormat, ExportPayload, ExportFilters, TabularPayload, LongformPayload,
} from "@/lib/export/types";

/**
 * GET /api/export?domain=keywords&format=xlsx&from=2026-05-01&to=2026-05-25&status=approved,researched
 *
 * Returns the exported file with appropriate Content-Type and
 * Content-Disposition: attachment; filename="..." headers.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get("domain") || "") as ExportDomain;
  const format = (searchParams.get("format") || "") as ExportFormat;
  const filters: ExportFilters = {
    from: searchParams.get("from") || undefined,
    to:   searchParams.get("to")   || undefined,
    statuses: searchParams.get("status")?.split(",").filter(Boolean),
    subject: searchParams.get("subject") || undefined,
  };

  const spec = findDomain(domain);
  if (!spec) {
    return NextResponse.json({ error: `unknown domain '${domain}'` }, { status: 400 });
  }
  if (!spec.implemented) {
    return NextResponse.json(
      { error: `domain '${domain}' not implemented yet — its source table or agent isn't live` },
      { status: 501 },
    );
  }
  if (!spec.allowedFormats.includes(format)) {
    return NextResponse.json(
      {
        error: `format '${format}' not allowed for domain '${domain}'`,
        allowed: spec.allowedFormats,
      },
      { status: 400 },
    );
  }

  let payload: ExportPayload;
  switch (domain) {
    case "keywords":
      payload = await fetchKeywordsPayload(filters);
      break;
    case "runs":
      payload = await fetchRunsPayload(filters);
      break;
    default:
      return NextResponse.json({ error: "no fetcher" }, { status: 501 });
  }

  const filename = buildFilename(domain, format);
  let body: Buffer | Uint8Array | string;

  if (payload.kind === "tabular") {
    body = await renderTabular(payload, format);
  } else {
    body = await renderLongform(payload, format);
  }

  const headers = new Headers({
    "Content-Type": FORMAT_MIME[format],
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  if (typeof body === "string") {
    return new NextResponse(body, { headers });
  }
  // Buffer / Uint8Array — Next.js handles either via Response body
  return new NextResponse(new Uint8Array(body), { headers });
}

async function renderTabular(p: TabularPayload, fmt: ExportFormat): Promise<Buffer | Uint8Array | string> {
  switch (fmt) {
    case "csv":  return renderCsv(p);
    case "xlsx": return renderXlsx(p);
    case "pdf":  return renderPdfTabular(p);
    case "docx": return renderDocxTabular(p);
    case "md":   return renderMdTabular(p);
    case "txt":  return renderTextTabular(p);
  }
}

async function renderLongform(p: LongformPayload, fmt: ExportFormat): Promise<Buffer | Uint8Array | string> {
  switch (fmt) {
    case "pdf":  return renderPdfLongform(p);
    case "docx": return renderDocxLongform(p);
    case "md":   return renderMdLongform(p);
    case "txt":  return renderTextLongform(p);
    case "csv":  // not meaningful for longform — emit as text
    case "xlsx":
      return renderTextLongform(p);
  }
}

function buildFilename(domain: ExportDomain, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  return `uteont-${domain}-${date}.${FORMAT_EXT[format]}`;
}
