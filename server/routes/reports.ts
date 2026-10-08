import { Router } from "express";
import { query } from "../db";
import { staffOnly } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { detailRows, matrix, summary, ReportFilters } from "../services/reports";
import { labelMethod, labelStatus, money, render, TableSpec } from "../services/exports";
import { formatEthiopianDate, formatInstant, monthName } from "../../shared/calendar/ethiopian";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { parseFilters, sendFile, wrap } from "./util";

export const reportsApi = Router();
reportsApi.use(staffOnly);

reportsApi.get("/summary", wrap(async (req, res) => {
  const f = parseFilters(req.query);
  const g = typeof req.query.groupBy === "string" ? req.query.groupBy : "none";
  if (!["none", "month", "department", "category", "memberType", "method"].includes(g)) throw badRequest();
  res.json(await summary({ ...f, year: f.year ?? currentPeriod().year }, g as any));
}));

reportsApi.get("/detail", wrap(async (req, res) => res.json(await detailRows(parseFilters(req.query)))));

reportsApi.get("/matrix", wrap(async (req, res) => res.json(await matrix(parseFilters(req.query)))));

// Human-readable description of the active filters, printed on every export.
async function describeFilters(f: ReportFilters): Promise<string[]> {
  const name = async (table: string, id?: number) => (id ? (await query(`select name from ${table} where id=$1`, [id])).rows[0]?.name : undefined);
  const parts: string[] = [];
  if (f.year) parts.push(`ዓመት፦ ${f.year} ዓ.ም.`);
  if (f.month) parts.push(`ወር፦ ${monthName(f.month)}`);
  if (f.dateFrom || f.dateTo) {
    const basis = f.dateBasis === "period" ? "የክፍያ ወር" : "የክፍያ ቀን";
    parts.push(`${basis}፦ ${f.dateFrom ? "ከ " + formatEthiopianDate(f.dateFrom) : ""} ${f.dateTo ? "እስከ " + formatEthiopianDate(f.dateTo) : ""}`.trim());
  }
  const dept = await name("service_departments", f.departmentId); if (dept) parts.push(`ክፍል፦ ${dept}`);
  const cat = await name("payment_categories", f.categoryId); if (cat) parts.push(`የክፍያ ምድብ፦ ${cat}`);
  const type = await name("member_types", f.memberTypeId); if (type) parts.push(`የአባልነት አይነት፦ ${type}`);
  if (f.status) parts.push(`ሁኔታ፦ ${labelStatus(f.status)}`);
  if (f.method) parts.push(`የክፍያ ዘዴ፦ ${labelMethod(f.method)}`);
  if (f.search) parts.push(`ፍለጋ፦ ${f.search}`);
  return parts.length ? [parts.join("  •  ")] : ["ሁሉም መረጃ (ምንም ማጣሪያ አልተመረጠም)"];
}

reportsApi.get("/export", wrap(async (req, res) => {
  const f = parseFilters(req.query);
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const type = String(req.query.type ?? "detail");
  const filterLines = await describeFilters(f);
  let spec: TableSpec;

  if (type === "detail") {
    const d = await detailRows(f, false);
    spec = {
      title: "የክፍያ ዝርዝር ሪፖርት", fileBase: "የክፍያ-ዝርዝር-ሪፖርት", landscape: true, filterLines,
      columns: [
        { header: "የአባል መለያ", key: "code", width: 11 }, { header: "ስም", key: "name", width: 24 }, { header: "ክፍል", key: "dept", width: 22 },
        { header: "የክፍያ ምድብ", key: "cat", width: 12 }, { header: "ወር", key: "period", width: 17 },
        { header: "የሚከፈል (ብር)", key: "expected", width: 12, type: "money" }, { header: "የተከፈለ (ብር)", key: "paid", width: 12, type: "money" },
        { header: "ሁኔታ", key: "status", width: 12 }, { header: "የክፍያ ዘዴ", key: "method", width: 12 }, { header: "የክፍያ ቀን", key: "date", width: 17 },
      ],
      rows: d.rows.map((r) => ({
        code: r.member_code, name: r.full_name, dept: r.department, cat: r.category, period: `${r.ethiopian_year} ${monthName(r.ethiopian_month)}`,
        expected: r.expected, paid: r.paid, status: labelStatus(r.status), method: labelMethod(r.method), date: r.paid_at ? formatInstant(r.paid_at) : "",
      })),
      totals: { code: "ጠቅላላ", expected: d.expected, paid: d.collected },
    };
  } else if (type === "summary") {
    const group = ["month", "department", "category", "memberType", "method"].includes(String(req.query.groupBy)) ? String(req.query.groupBy) : "month";
    const s = await summary({ ...f, year: f.year ?? currentPeriod().year }, group as any);
    const labelOf = (r: any) => (group === "month" ? `${r.year} ${monthName(r.label)}` : group === "method" ? labelMethod(r.label) || "—" : r.label);
    const heading = { month: "ወር", department: "ክፍል", category: "የክፍያ ምድብ", memberType: "የአባልነት አይነት", method: "የክፍያ ዘዴ" }[group]!;
    spec = {
      title: "የክፍያ ማጠቃለያ ሪፖርት", fileBase: "የክፍያ-ማጠቃለያ-ሪፖርት", landscape: true, filterLines,
      columns: [
        { header: heading, key: "label", width: 24 }, { header: "አባላት", key: "members", width: 9 }, { header: "የከፈሉ", key: "mp", width: 9 },
        { header: "ያልከፈሉ", key: "mu", width: 9 }, { header: "በማረጋገጥ ላይ", key: "mpe", width: 11 },
        { header: "የሚጠበቅ (ብር)", key: "expected", width: 13, type: "money" }, { header: "የተሰበሰበ (ብር)", key: "collected", width: 13, type: "money" },
        { header: "በማረጋገጥ ላይ (ብር)", key: "pa", width: 14, type: "money" }, { header: "ያልተሰበሰበ (ብር)", key: "ua", width: 14, type: "money" },
      ],
      rows: s.groups.map((r) => ({ label: labelOf(r), members: r.members, mp: r.members_paid, mu: r.members_unpaid, mpe: r.members_pending, expected: r.expected, collected: r.collected, pa: r.pending_amount, ua: r.unpaid_amount })),
      totals: { label: "ጠቅላላ", members: s.totals.members, mp: s.totals.members_paid, mu: s.totals.members_unpaid, mpe: s.totals.members_pending, expected: s.totals.expected, collected: s.totals.collected, pa: s.totals.pending_amount, ua: s.totals.unpaid_amount },
    };
  } else if (type === "matrix") {
    const m = await matrix({ ...f, page: 1, pageSize: 100 });
    const all = [...m.rows];
    for (let p = 2; p <= Math.min(Math.ceil(m.total / 100), 200); p++) all.push(...(await matrix({ ...f, page: p, pageSize: 100 })).rows);
    const monthsShown = Array.from({ length: 13 }, (_, i) => i).filter((i) => all.some((r) => r.months[i]));
    spec = {
      title: `የ${m.year} ዓ.ም. የክፍያ ሁኔታ`, fileBase: "የክፍያ-ሁኔታ", landscape: true, filterLines,
      legend: "በሴሎቹ ውስጥ ያሉት ቃላት የወሩን የክፍያ ሁኔታ ያሳያሉ፤ «—» ማለት ለዚህ አባል የማይመለከት ወር ነው።",
      columns: [
        { header: "ተ.ቁ", key: "no", width: 5 }, { header: "አባል", key: "name", width: 24 }, { header: "ክፍል", key: "dept", width: 20 },
        ...monthsShown.map((i) => ({ header: monthName(i + 1), key: `m${i}`, width: 11, type: "mark" as const })),
        { header: "የተከፈለ (ብር)", key: "paid", width: 11, type: "money" as const }, { header: "ያልተከፈለ (ብር)", key: "open", width: 12, type: "money" as const },
      ],
      rows: all.map((r, n) => ({
        no: n + 1, name: `${r.full_name} (${r.member_code})`, dept: r.department, paid: r.paid, open: r.open,
        ...Object.fromEntries(monthsShown.map((i) => [`m${i}`, r.months[i]?.status ?? null])),
      })),
    };
  } else throw badRequest();
  const out = await render(spec, format);
  sendFile(res, out.buffer, out.mime, out.filename);
}));
void money;
