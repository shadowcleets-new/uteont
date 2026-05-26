import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TabularPayload, LongformPayload } from "../types";

const PAGE_W = 612;        // US Letter
const PAGE_H = 792;
const MARGIN = 48;
const LINE_H = 14;

async function newDoc() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle("UTEONT export");
  pdf.setProducer("UTEONT");
  pdf.setCreator("UTEONT");
  pdf.setCreationDate(new Date());
  return { pdf, font, bold };
}

export async function renderPdfTabular(payload: TabularPayload): Promise<Uint8Array> {
  const { pdf, font, bold } = await newDoc();
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  page.drawText(payload.title, { x: MARGIN, y, size: 18, font: bold, color: rgb(0.08, 0.08, 0.07) });
  y -= 24;
  page.drawText(`Generated ${payload.generatedAt} · ${payload.filterSummary}`, {
    x: MARGIN, y, size: 9, font, color: rgb(0.42, 0.42, 0.39),
  });
  y -= 18;

  const usableWidth = PAGE_W - 2 * MARGIN;
  const colCount = payload.columns.length;
  const colWidth = colCount > 0 ? usableWidth / colCount : usableWidth;

  // Header row
  page.drawText(payload.columns.map((c) => c.label).join("  |  "), {
    x: MARGIN, y, size: 9, font: bold, color: rgb(0.08, 0.08, 0.07),
  });
  y -= LINE_H;
  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: PAGE_W - MARGIN, y: y + 4 },
    thickness: 0.5, color: rgb(0.85, 0.85, 0.82),
  });

  for (const row of payload.rows) {
    if (y < MARGIN + LINE_H) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    const cells = payload.columns.map((c) => {
      const v = row[c.key];
      const s = v === null || v === undefined ? "" : String(v);
      // Truncate to keep rows on one line
      const maxLen = Math.max(8, Math.floor(colWidth / 5.5));
      return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
    });
    page.drawText(cells.join("  |  "), {
      x: MARGIN, y, size: 8, font, color: rgb(0.08, 0.08, 0.07),
    });
    y -= LINE_H;
  }

  if (payload.rows.length === 0) {
    page.drawText("(no rows)", { x: MARGIN, y, size: 9, font, color: rgb(0.6, 0.6, 0.55) });
  }

  return pdf.save();
}

export async function renderPdfLongform(payload: LongformPayload): Promise<Uint8Array> {
  const { pdf, font, bold } = await newDoc();
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  page.drawText(payload.title, { x: MARGIN, y, size: 20, font: bold, color: rgb(0.08, 0.08, 0.07) });
  y -= 26;
  page.drawText(`Generated ${payload.generatedAt} · ${payload.filterSummary}`, {
    x: MARGIN, y, size: 9, font, color: rgb(0.42, 0.42, 0.39),
  });
  y -= 24;

  const maxLineChars = 90;

  const writeWrapped = (text: string, sz: number, f: typeof font) => {
    const words = text.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (test.length > maxLineChars) {
        if (y < MARGIN + LINE_H) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }
        page.drawText(line, { x: MARGIN, y, size: sz, font: f, color: rgb(0.08, 0.08, 0.07) });
        y -= LINE_H;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      if (y < MARGIN + LINE_H) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: sz, font: f, color: rgb(0.08, 0.08, 0.07) });
      y -= LINE_H;
    }
  };

  for (const section of payload.sections) {
    if (y < MARGIN + 40) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    page.drawText(section.heading, { x: MARGIN, y, size: 14, font: bold, color: rgb(0.08, 0.08, 0.07) });
    y -= LINE_H + 4;
    for (const para of section.body.split(/\n{2,}/)) {
      writeWrapped(para.trim(), 10, font);
      y -= 6;
    }
    y -= 10;
  }

  return pdf.save();
}
