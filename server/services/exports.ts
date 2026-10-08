import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { formatEthiopianDate, formatInstant, formatPeriod, monthName, toEthiopian } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL, STATUS_LABEL, TX_STATUS_LABEL } from "../../shared/labels";
import { storage } from "../lib/storage";
import regularB64 from "../lib/font-regular.generated";
import boldB64 from "../lib/font-bold.generated";
import { getSettings, Settings } from "./settings";

const FONT_REGULAR = Buffer.from(regularB64, "base64");
const FONT_BOLD = Buffer.from(boldB64, "base64");

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export const money = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const birr = (n: number | string | null | undefined) => `${money(n)} ብር`;

const BLUE = "#1F6FB5", BLUE_DARK = "#174B7A", BLUE_LIGHT = "#DCEBFA", GRAY_LIGHT = "#F3F5F8", LINE = "#D5DEE8", TEXT = "#1F2A37", MUTED = "#5B6B7C";

export interface Column {
  header: string; key: string; width: number; align?: "left" | "right" | "center";
  type?: "text" | "money" | "mark"; total?: boolean;
}
export interface TableSpec {
  title: string; filterLines?: string[]; columns: Column[]; rows: Record<string, any>[];
  totals?: Record<string, any>; landscape?: boolean; legend?: string; fileBase: string;
  summaryLines?: string[]; notes?: string[];
}

async function loadLogo(s: Settings): Promise<{ buffer: Buffer; ext: "png" | "jpeg" } | null> {
  if (!s.logoKey || !s.logoMime) return null;
  if (!["image/png", "image/jpeg"].includes(s.logoMime)) return null;
  const buffer = await storage().get(s.logoKey).catch(() => null);
  return buffer ? { buffer, ext: s.logoMime === "image/png" ? "png" : "jpeg" } : null;
}
const generatedLine = () => `የወጣበት ቀን፦ ${formatInstant(new Date(), true)}`;

// ═════════════════════════ PDF ═════════════════════════

function newDoc(landscape: boolean) {
  const doc = new PDFDocument({
    size: "A4", layout: landscape ? "landscape" : "portrait", margin: 36, bufferPages: true, font: FONT_REGULAR as any,
    info: { Title: "Meserete Hiwot Sunday School", Producer: "mhpayment" },
  });
  doc.registerFont("reg", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("reg");
  return doc;
}
const finish = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });

function drawHeader(doc: PDFKit.PDFDocument, s: Settings, logo: Awaited<ReturnType<typeof loadLogo>>, title: string, lines: string[]) {
  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  let textX = left;
  if (logo) { try { doc.image(logo.buffer, left, 36, { fit: [52, 52] }); textX = left + 64; } catch { /* unreadable logo → skip */ } }
  if (s.orgParent) doc.font("bold").fontSize(12).fillColor(BLUE_DARK).text(s.orgParent, textX, 36, { width: width - (textX - left) });
  doc.font("bold").fontSize(15).fillColor(BLUE_DARK).text(s.orgName, textX, s.orgParent ? doc.y + 1 : 38, { width: width - (textX - left) });
  doc.font("bold").fontSize(13).fillColor(TEXT).text(title, textX, doc.y + 2, { width: width - (textX - left) });
  doc.font("reg").fontSize(8.5).fillColor(MUTED);
  for (const l of [...lines, generatedLine()]) doc.text(l, textX, doc.y + 1, { width: width - (textX - left) });
  const bottom = Math.max(doc.y, 36 + 52) + 8;
  doc.moveTo(left, bottom).lineTo(left + width, bottom).lineWidth(1.2).strokeColor(BLUE).stroke();
  doc.y = bottom + 10;
  doc.x = left;
}

function drawMark(doc: PDFKit.PDFDocument, status: string | null, cx: number, cy: number) {
  doc.save().lineWidth(1.6).lineCap("round").lineJoin("round");
  if (status === "PAID") {
    doc.strokeColor("#1E8E5A").moveTo(cx - 4.5, cy).lineTo(cx - 1.2, cy + 3.5).lineTo(cx + 5, cy - 4).stroke();
  } else if (status === "PENDING") {
    doc.fillColor("#B7791F").circle(cx - 4, cy, 1.2).fill().circle(cx, cy, 1.2).fill().circle(cx + 4, cy, 1.2).fill();
  } else if (status === "UNPAID" || status === "REJECTED") {
    doc.strokeColor(status === "REJECTED" ? "#C0392B" : "#8A97A6").moveTo(cx - 3.5, cy - 3.5).lineTo(cx + 3.5, cy + 3.5).moveTo(cx + 3.5, cy - 3.5).lineTo(cx - 3.5, cy + 3.5).stroke();
  } else {
    doc.fillColor(LINE).fontSize(9).text("—", cx - 4, cy - 5, { width: 8, align: "center" });
  }
  doc.restore();
}

export async function buildPdfTable(spec: TableSpec): Promise<Buffer> {
  const s = await getSettings(); const logo = await loadLogo(s);
  const doc = newDoc(!!spec.landscape);
  const left = doc.page.margins.left, usable = doc.page.width - left - doc.page.margins.right;
  const sumW = spec.columns.reduce((a, c) => a + c.width, 0);
  const widths = spec.columns.map((c) => (c.width / sumW) * usable);
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 18;
  const PAD = 4;

  const cellText = (c: Column, row: Record<string, any>) => {
    const v = row[c.key];
    if (c.type === "money") return v === null || v === undefined || v === "" ? "" : money(v);
    return v === null || v === undefined ? "" : String(v);
  };

  const drawRow = (row: Record<string, any>, opts: { header?: boolean; zebra?: boolean; total?: boolean }) => {
    doc.font(opts.header || opts.total ? "bold" : "reg").fontSize(opts.header ? 8.5 : 8.5);
    let h = 16;
    spec.columns.forEach((c, i) => {
      if (c.type === "mark" && !opts.header) return;
      h = Math.max(h, doc.heightOfString(opts.header ? c.header : cellText(c, row), { width: widths[i] - PAD * 2 }) + PAD * 2);
    });
    if (doc.y + h > bottomLimit()) { doc.addPage(); drawTableHeader(); }
    const y = doc.y;
    let x = left;
    doc.save().rect(left, y, usable, h).fill(opts.header ? BLUE_LIGHT : opts.total ? "#EAF2FB" : opts.zebra ? GRAY_LIGHT : "#FFFFFF").restore();
    spec.columns.forEach((c, i) => {
      const w = widths[i];
      if (c.type === "mark" && !opts.header && !opts.total) drawMark(doc, row[c.key], x + w / 2, y + h / 2);
      else {
        doc.font(opts.header || opts.total ? "bold" : "reg").fontSize(8.5).fillColor(opts.header ? BLUE_DARK : TEXT)
          .text(opts.header ? c.header : cellText(c, row), x + PAD, y + PAD, { width: w - PAD * 2, align: c.type === "money" ? "right" : c.align ?? (c.type === "mark" ? "center" : "left") });
      }
      x += w;
    });
    doc.save().moveTo(left, y + h).lineTo(left + usable, y + h).lineWidth(0.5).strokeColor(LINE).stroke().restore();
    doc.x = left; doc.y = y + h;
  };
  const drawTableHeader = () => drawRow({}, { header: true });

  drawHeader(doc, s, logo, spec.title, spec.filterLines ?? []);
  drawTableHeader();
  if (!spec.rows.length) doc.font("reg").fontSize(10).fillColor(MUTED).text("ምንም መረጃ አልተገኘም።", left, doc.y + 12);
  spec.rows.forEach((r, i) => drawRow(r, { zebra: i % 2 === 1 }));
  if (spec.totals && spec.rows.length) drawRow(spec.totals, { total: true });
  if (spec.columns.some((c) => c.type === "mark") && spec.rows.length) {
    // legend drawn with real shapes (the ✓ ✕ glyphs do not exist in the Amharic font)
    let lx = left; const ly = doc.y + 14;
    for (const [st, label] of [["PAID", "ተከፍሏል"], ["PENDING", "በማረጋገጥ ላይ"], ["UNPAID", "አልተከፈለም"], ["REJECTED", "አልተቀበለም"], [null, "አይመለከተውም"]] as const) {
      drawMark(doc, st, lx + 7, ly); doc.font("reg").fontSize(8.5).fillColor(MUTED).text(label, lx + 18, ly - 5, { lineBreak: false });
      lx += 28 + doc.widthOfString(label) + 14;
    }
  } else if (spec.legend) doc.font("reg").fontSize(8).fillColor(MUTED).text(spec.legend, left, doc.y + 8, { width: usable });

  const ensure = (h: number) => { if (doc.y + h > bottomLimit()) doc.addPage(); };
  if (spec.summaryLines?.length) {
    doc.y += 10;
    for (const l of spec.summaryLines) { ensure(26); doc.font("bold").fontSize(12).fillColor(BLUE_DARK).text(l, left, doc.y + 4, { width: usable }); }
  }
  if (spec.notes?.length) {
    doc.y += 10;
    for (const n of spec.notes) {
      doc.font("bold").fontSize(9.5);
      const h = doc.heightOfString(n, { width: usable - 16 }) + 10;
      ensure(h + 4);
      const y = doc.y + 4;
      doc.save().rect(left, y, usable, h).fill("#FFF6DD").restore();
      doc.save().rect(left, y, 3, h).fill("#B08429").restore();
      doc.font("bold").fontSize(9.5).fillColor(TEXT).text(n, left + 10, y + 5, { width: usable - 16 });
      doc.y = y + h;
    }
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const m = doc.page.margins.bottom; doc.page.margins.bottom = 0; // otherwise writing in the footer area adds a blank page
    doc.font("reg").fontSize(8).fillColor(MUTED);
    doc.text(`${s.orgName}  •  ገጽ ${i + 1} ከ ${range.count}`, left, doc.page.height - 30, { width: usable, align: "center", lineBreak: false });
    doc.page.margins.bottom = m;
  }
  return finish(doc);
}

export interface ConfirmationData {
  referenceNo: string; fullName: string; memberCode: string; phone: string; department: string; category: string;
  method: string; status: string; amount: number; paidAt: Date | string; reviewedAt: Date | string | null;
  items: { year: number; month: number; amount: number }[];
}

export async function buildConfirmationPdf(d: ConfirmationData): Promise<Buffer> {
  const s = await getSettings(); const logo = await loadLogo(s);
  const doc = newDoc(false);
  const left = doc.page.margins.left, usable = doc.page.width - left - doc.page.margins.right;
  drawHeader(doc, s, logo, "የክፍያ ማረጋገጫ", []);
  const row = (k: string, v: string, bold = false) => {
    const y = doc.y;
    doc.font("reg").fontSize(10).fillColor(MUTED).text(k, left, y, { width: 150 });
    doc.font(bold ? "bold" : "reg").fontSize(11).fillColor(TEXT).text(v, left + 160, y, { width: usable - 160 });
    doc.y = Math.max(doc.y, y + 16) + 5;
    doc.moveTo(left, doc.y - 3).lineTo(left + usable, doc.y - 3).lineWidth(0.4).strokeColor(LINE).stroke();
  };
  row("የማረጋገጫ ቁጥር", d.referenceNo, true);
  row("የአባል ስም", d.fullName, true);
  row("የአባል መለያ", d.memberCode);
  row("ክፍል", d.department);
  row("የክፍያ ምድብ", d.category);
  row("የክፍያ ዘዴ", METHOD_LABEL[d.method] ?? d.method);
  row("የክፍያ ቀን", formatInstant(d.paidAt, true));
  if (d.reviewedAt) row("የተረጋገጠበት ቀን", formatInstant(d.reviewedAt, true));
  row("ሁኔታ", TX_STATUS_LABEL[d.status] ?? d.status, true);
  doc.moveDown(0.8);
  doc.font("bold").fontSize(11).fillColor(BLUE_DARK).text("የተከፈለባቸው ወራት", left, doc.y);
  doc.moveDown(0.3);
  for (const it of d.items) {
    const y = doc.y;
    doc.save().rect(left, y, usable, 20).fill(GRAY_LIGHT).restore();
    doc.font("reg").fontSize(10.5).fillColor(TEXT).text(formatPeriod(it.year, it.month), left + 8, y + 5, { width: usable - 120 });
    doc.text(birr(it.amount), left + usable - 110, y + 5, { width: 102, align: "right" });
    doc.y = y + 23;
  }
  doc.moveDown(0.4);
  const y = doc.y;
  doc.save().rect(left, y, usable, 28).fill(BLUE_LIGHT).restore();
  doc.font("bold").fontSize(12).fillColor(BLUE_DARK).text("ጠቅላላ መጠን", left + 8, y + 8, { width: 200 });
  doc.text(birr(d.amount), left + usable - 160, y + 8, { width: 152, align: "right" });
  doc.y = y + 44;
  doc.font("reg").fontSize(9).fillColor(MUTED).text("ይህ ሰነድ በሥርዓቱ የተመዘገበውን ክፍያ የሚያረጋግጥ ነው። ማንኛውም ጥያቄ ካለዎት የገንዘብ ያዡን ያነጋግሩ።", left, doc.y, { width: usable });
  const contact = [s.orgPhone && `ስልክ፦ ${s.orgPhone}`, s.orgEmail && `ኢሜይል፦ ${s.orgEmail}`, s.orgAddress].filter(Boolean).join("  •  ");
  if (contact) doc.moveDown(0.3).text(contact, left, doc.y, { width: usable });
  doc.moveDown(0.3).text(generatedLine(), left, doc.y, { width: usable });
  return finish(doc);
}

// ═════════════════════════ EXCEL ═════════════════════════

export async function buildXlsx(spec: TableSpec): Promise<Buffer> {
  const s = await getSettings(); const logo = await loadLogo(s);
  const wb = new ExcelJS.Workbook();
  wb.creator = s.orgName; wb.created = new Date();
  const ws = wb.addWorksheet(spec.title.slice(0, 28).replace(/[\\/?*[\]:]/g, " "), {
    views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: spec.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const FONT = "Nyala";
  const n = spec.columns.length;
  spec.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(6, Math.round(c.width * 1.15)); });
  const textStart = logo ? 2 : 1;
  const putTitle = (row: number, text: string, size: number, bold: boolean, color: string) => {
    const r = ws.getRow(row);
    r.getCell(textStart).value = text;
    r.getCell(textStart).font = { name: FONT, size, bold, color: { argb: "FF" + color.slice(1) } };
    if (n > textStart) ws.mergeCells(row, textStart, row, n);
    r.height = size + 10;
  };
  putTitle(1, s.orgParent || " ", 12, true, BLUE_DARK);
  putTitle(2, s.orgName, 16, true, BLUE_DARK);
  putTitle(3, spec.title, 13, true, TEXT);
  putTitle(4, [...(spec.filterLines ?? []), generatedLine()].join("  |  "), 10, false, MUTED);
  ws.getRow(5).height = 6;
  if (logo) {
    const id = wb.addImage({ buffer: logo.buffer as any, extension: logo.ext });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 58, height: 58 } });
    if (ws.getColumn(1).width! < 9) ws.getColumn(1).width = 9;
  }
  const head = ws.getRow(6);
  head.height = 24;
  spec.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: "FF174B7A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEBFA" } };
    cell.alignment = { vertical: "middle", horizontal: c.type === "money" ? "right" : c.type === "mark" ? "center" : "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF1F6FB5" } } };
  });
  const markText: Record<string, [string, string]> = { PAID: ["ተከፍሏል", "FF16724B"], PENDING: ["በማረጋገጥ ላይ", "FF85570A"], UNPAID: ["አልተከፈለም", "FF4F6173"], REJECTED: ["አልተቀበለም", "FFAD3226"] };
  spec.rows.forEach((r, ri) => {
    const row = ws.getRow(7 + ri);
    spec.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = r[c.key];
      if (c.type === "mark") {
        const m = v ? markText[v] : null;
        cell.value = m ? m[0] : "—";
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: m ? m[1] : "FFB0BAC5" } };
        cell.alignment = { horizontal: "center" };
      } else if (c.type === "money") {
        cell.value = v === null || v === undefined || v === "" ? null : Number(v);
        cell.numFmt = "#,##0.00"; cell.font = { name: FONT, size: 11 };
      } else {
        cell.value = v === null || v === undefined ? "" : (typeof v === "number" ? v : String(v));
        cell.font = { name: FONT, size: 11 }; cell.alignment = { horizontal: c.align ?? "left", wrapText: true, vertical: "top" };
      }
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F9FC" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD5DEE8" } } };
    });
  });
  if (spec.totals && spec.rows.length) {
    const row = ws.getRow(7 + spec.rows.length);
    spec.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = spec.totals![c.key];
      cell.value = c.type === "money" && v !== undefined && v !== "" ? Number(v) : v ?? "";
      if (c.type === "money") cell.numFmt = "#,##0.00";
      cell.font = { name: FONT, size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FB" } };
      cell.border = { top: { style: "thin", color: { argb: "FF1F6FB5" } } };
    });
  }
  if (spec.legend) {
    const r = ws.getRow(9 + spec.rows.length); r.getCell(1).value = spec.legend; r.getCell(1).font = { name: FONT, size: 10, color: { argb: "FF5B6B7C" } };
  }
  let noteRow = 9 + spec.rows.length + (spec.legend ? 2 : 0);
  for (const line of [...(spec.summaryLines ?? []), ...(spec.notes ?? [])]) {
    const r = ws.getRow(noteRow++);
    r.getCell(1).value = line;
    r.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: "FF174B7A" } };
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    if (n > 1) ws.mergeCells(r.number, 1, r.number, n);
    r.height = line.length > 90 ? 34 : 20;
  }
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: n } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function render(spec: TableSpec, format: "xlsx" | "pdf") {
  return format === "pdf"
    ? { buffer: await buildPdfTable(spec), mime: MIME.pdf, filename: `${spec.fileBase}.pdf` }
    : { buffer: await buildXlsx(spec), mime: MIME.xlsx, filename: `${spec.fileBase}.xlsx` };
}

// helpers to describe filters in Amharic on the exported document
export const labelStatus = (s: string | null) => (s ? STATUS_LABEL[s] ?? s : "");
export const labelMethod = (m: string | null) => (m ? METHOD_LABEL[m] ?? m : "");
export { formatEthiopianDate, formatInstant, formatPeriod, monthName, toEthiopian };
