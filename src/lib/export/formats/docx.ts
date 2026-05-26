import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
} from "docx";
import type { TabularPayload, LongformPayload } from "../types";

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "E8E6DC" };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

export async function renderDocxTabular(payload: TabularPayload): Promise<Buffer> {
  const headerCells = payload.columns.map(
    (c) =>
      new TableCell({
        shading: { fill: "141413" },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: c.label, bold: true, color: "FFFFFF" }),
            ],
          }),
        ],
        borders: ALL_BORDERS,
      }),
  );

  const dataRows = payload.rows.map(
    (row) =>
      new TableRow({
        children: payload.columns.map(
          (c) =>
            new TableCell({
              children: [
                new Paragraph(String(row[c.key] ?? "")),
              ],
              borders: ALL_BORDERS,
            }),
        ),
      }),
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...dataRows],
  });

  const doc = new Document({
    creator: "UTEONT",
    title: payload.title,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: payload.title, bold: true })] }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: `Generated ${payload.generatedAt} · ${payload.filterSummary}`,
                color: "6B6A64",
                size: 18,
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          table,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function renderDocxLongform(payload: LongformPayload): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: payload.title, bold: true })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${payload.generatedAt} · ${payload.filterSummary}`,
          color: "6B6A64",
          size: 18,
        }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }),
  ];

  for (const section of payload.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: section.heading, bold: true })],
      }),
    );
    for (const para of section.body.split(/\n{2,}/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: para.trim() })] }));
    }
  }

  const doc = new Document({
    creator: "UTEONT",
    title: payload.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
