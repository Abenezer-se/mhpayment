import { Router } from "express";
import { getPool, query } from "../db";
import { staffOnly } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { birr, money, render, TableSpec } from "../services/exports";
import { FollowStatus, FollowUpFilters, runFollowUp } from "../services/followup";
import { getSettings } from "../services/settings";
import { formatEthiopianDate, monthName } from "../../shared/calendar/ethiopian";
import { intOrUndef, parseFilters, sendFile, wrap } from "./util";

export const followupApi = Router();
followupApi.use(staffOnly);

const STATUSES: FollowStatus[] = ["all", "paid", "unpaid", "partial"];
const STATUS_TEXT: Record<FollowStatus, string> = { all: "ሁሉም አባላት", paid: "የከፈሉ አባላት", unpaid: "ያልከፈሉ አባላት", partial: "በከፊል የከፈሉ አባላት" };

function parse(q: any): FollowUpFilters {
  const f = parseFilters(q);
  const status = STATUSES.includes(q.status) ? (q.status as FollowStatus) : "all";
  const pick = (y: unknown, m: unknown) => { const year = intOrUndef(y), month = intOrUndef(m); return year && month ? { year, month } : undefined; };
  return {
    search: f.search, departmentId: f.departmentId, categoryId: f.categoryId, status,
    from: pick(q.fromYear, q.fromMonth), to: pick(q.toYear, q.toMonth), includePending: q.includePending === "1", page: f.page, pageSize: f.pageSize,
  };
}

followupApi.get("/", wrap(async (req, res) => res.json(await runFollowUp(parse(req.query)))));

async function nameOf(table: string, id?: number) { return id ? (await query(`select name from ${table} where id = $1`, [id])).rows[0]?.name : undefined; }

async function describe(f: FollowUpFilters, period: { from: any; to: any }) {
  const parts = [`ሁኔታ፦ ${STATUS_TEXT[f.status ?? "all"]}`];
  const dept = await nameOf("service_departments", f.departmentId); if (dept) parts.push(`የአገልግሎት ክፍል፦ ${dept}`);
  const cat = await nameOf("payment_categories", f.categoryId); if (cat) parts.push(`የአባል አይነት፦ ${cat}`);
  parts.push(`ወር፦ ${monthName(period.from.month)} ${period.from.year} - ${monthName(period.to.month)} ${period.to.year}`);
  if (f.search) parts.push(`ፍለጋ፦ ${f.search}`);
  if (f.includePending) parts.push("በማረጋገጥ ላይ ያሉ እንደ ያልተከፈለ ተቆጥረዋል");
  return parts.join("  •  ");
}

const COLUMN_DEFS: Record<string, { header: string; key: string; width: number; type?: "money"; align?: "center" }> = {
  type: { header: "የአባል አይነት", key: "cat", width: 13 },
  dept: { header: "የአገልግሎት ክፍል", key: "dept", width: 24 },
  paidMonths: { header: "የተከፈሉ ወራት", key: "pm", width: 26 },
  paidCount: { header: "የተከፈሉ ወራት ብዛት", key: "pc", width: 10, align: "center" },
  paidAmount: { header: "የተከፈለ መጠን (ብር)", key: "pa", width: 13, type: "money" },
  unpaidMonths: { header: "ያልተከፈሉ ወራት", key: "um", width: 26 },
  unpaidCount: { header: "ያልተከፈሉ ወራት ብዛት", key: "uc", width: 11, align: "center" },
  unpaidAmount: { header: "ያልተከፈለ መጠን (ብር)", key: "ua", width: 13, type: "money" },
  pendingMonths: { header: "በማረጋገጥ ላይ ያሉ ወራት", key: "pen", width: 22 },
};
const ORDER = Object.keys(COLUMN_DEFS);
const DEFAULT_COLS: Record<FollowStatus, string[]> = {
  paid: ["type", "dept", "paidMonths", "paidCount", "paidAmount"],
  unpaid: ["type", "dept", "unpaidMonths", "unpaidCount", "unpaidAmount"],
  all: ["type", "dept", "paidMonths", "paidAmount", "unpaidMonths", "unpaidCount", "unpaidAmount"],
  partial: ["type", "dept", "paidMonths", "paidAmount", "unpaidMonths", "unpaidCount", "unpaidAmount"],
};
const TITLE: Record<FollowStatus, string> = { all: "የአባላት የክፍያ ሁኔታ ሪፖርት", paid: "የከፈሉ አባላት ሪፖርት", unpaid: "የክፍያ ክትትል — ያልከፈሉ አባላት", partial: "የክፍያ ክትትል — በከፊል የከፈሉ አባላት" };

followupApi.get("/export", wrap(async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const type = req.query.type === "telegram" ? "telegram" : "followup";
  const f = parse(req.query);
  if (type === "telegram") f.status = "unpaid"; // the Telegram report is always the list of members who owe
  const d = await runFollowUp(f, false);
  const filterLines = [await describe(f, d.period), `ጠቅላላ አባላት፦ ${d.rows.length}`];
  let spec: TableSpec;

  if (type === "telegram") {
    const totalAmount = d.rows.reduce((s, r) => s + r.unpaid.amount, 0);
    spec = {
      title: "የወርሃዊ ክፍያ ክትትል", fileBase: "የወርሃዊ-ክፍያ-ክትትል", filterLines,
      columns: [
        { header: "ተ.ቁ", key: "no", width: 6, align: "center" }, { header: "የአባል ስም", key: "name", width: 30 },
        { header: "ያልተከፈሉ ወራት", key: "months", width: 34 }, { header: "ብዛት", key: "count", width: 8, align: "center" }, { header: "የሚከፈል", key: "amount", width: 14, align: "right" },
      ],
      rows: d.rows.map((r, i) => ({ no: i + 1, name: r.full_name, months: r.unpaid.label, count: r.unpaid.count, amount: birr(r.unpaid.amount) })),
      summaryLines: [`ጠቅላላ ያልተከፈለ መጠን: ${birr(totalAmount)}`],
    };
  } else {
    const wanted = String(req.query.cols ?? "").split(",").filter((k) => ORDER.includes(k));
    const keys = ORDER.filter((k) => (wanted.length ? wanted : DEFAULT_COLS[f.status ?? "all"]).includes(k));
    if (!keys.length) throw badRequest("ቢያንስ አንድ ዓምድ ይምረጡ።");
    const columns = [
      { header: "ተ.ቁ", key: "no", width: 6, align: "center" as const }, { header: "የአባል ስም", key: "name", width: 28 },
      ...keys.map((k) => ({ header: COLUMN_DEFS[k].header, key: COLUMN_DEFS[k].key, width: COLUMN_DEFS[k].width, type: COLUMN_DEFS[k].type, align: COLUMN_DEFS[k].align })),
    ];
    const sumOf = (pick: (r: (typeof d.rows)[number]) => number) => d.rows.reduce((s, r) => s + pick(r), 0);
    spec = {
      title: TITLE[f.status ?? "all"], fileBase: "የክፍያ-ክትትል", filterLines, landscape: columns.length > 6, columns,
      rows: d.rows.map((r, i) => ({
        no: i + 1, name: r.full_name, cat: r.category, dept: r.department,
        pm: r.paid.label, pc: r.paid.count, pa: r.paid.amount, um: r.unpaid.label, uc: r.unpaid.count, ua: r.unpaid.amount, pen: r.pending.label,
      })),
      totals: { name: "ጠቅላላ", pc: sumOf((r) => r.paid.count), pa: sumOf((r) => r.paid.amount), uc: sumOf((r) => r.unpaid.count), ua: sumOf((r) => r.unpaid.amount) },
    };
  }
  const out = await render(spec, format);
  sendFile(res, out.buffer, out.mime, out.filename);
}));

/** Plain text for pasting straight into a Telegram message. */
followupApi.get("/telegram-text", wrap(async (req, res) => {
  const f = parse(req.query); f.status = "unpaid";
  const d = await runFollowUp(f, false);
  const s = await getSettings();
  const total = d.rows.reduce((a, r) => a + r.unpaid.amount, 0);
  const lines = [
    "የወርሃዊ ክፍያ ክትትል", s.orgName,
    `ወር፦ ${monthName(d.period.from.month)} ${d.period.from.year} - ${monthName(d.period.to.month)} ${d.period.to.year}`, "",
    ...d.rows.map((r, i) => `${i + 1}. ${r.full_name} — ${r.unpaid.label} (${r.unpaid.count} ወራት) — ${money(r.unpaid.amount)} ብር`),
    "", `ጠቅላላ ያልተከፈለ መጠን: ${money(total)} ብር`,
  ];
  if (!d.rows.length) lines.splice(4, 0, "ያልከፈለ አባል የለም።");
  res.json({ text: lines.join("\n"), count: d.rows.length, date: formatEthiopianDate(d.period.to as any) });
}));
void getPool;