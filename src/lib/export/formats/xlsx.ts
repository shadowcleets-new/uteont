import ExcelJS from "exceljs";
import type { TabularPayload } from "../types";

export async function renderXlsx(payload: TabularPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UTEONT";
  wb.created = new Date();

  const ws = wb.addWorksheet(payload.title.slice(0, 31));

  ws.columns = payload.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(12, c.label.length + 2),
  }));

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF141413" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;

  payload.rows.forEach((row) => ws.addRow(row));

  // Auto-filter on header
  if (payload.columns.length > 0 && payload.rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: payload.rows.length + 1, column: payload.columns.length },
    };
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
