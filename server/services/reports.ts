import { query } from "../db";
import { EtDate, isValidEthiopianDate } from "../../shared/calendar/ethiopian";
import { currentPeriod, etRangeToInstants } from "../../shared/calendar/payment-period";
import { searchClause } from "./members";

export interface ReportFilters {
  year?: number; month?: number; departmentId?: number; categoryId?: number; memberTypeId?: number;
  status?: string; method?: string; search?: string; dateFrom?: EtDate; dateTo?: EtDate;
  /** what the date range applies to: the payment date (default) or the payment period */
  dateBasis?: "paid" | "period"; page?: number; pageSize?: number;
}

const FROM = `
  from payment_obligations o
  join payment_periods p on p.id = o.period_id
  join members m on m.id = o.member_id
  join users u on u.id = m.user_id
  join member_types mt on mt.id = m.member_type_id
  join service_departments d on d.id = m.department_id
  join payment_categories c on c.id = o.category_id
  left join payment_transaction_items ti on ti.obligation_id = o.id and ti.is_active
  left join payment_transactions t on t.id = ti.transaction_id`;

/** ONE place that turns the filters into SQL, so screens and exports always agree. All filters combine with AND. */
export function buildWhere(f: ReportFilters, params: unknown[] = []): string {
  // open debts of deactivated members are not "owed"; their paid/pending history stays visible
  let w = " where (m.is_active or o.status in ('PAID','PENDING'))";
  const add = (sql: string, val: unknown) => { params.push(val); w += ` and ${sql.replace("?", `$${params.length}`)}`; };
  if (f.year) add("o.ethiopian_year = ?", f.year);
  if (f.month) add("o.ethiopian_month = ?", f.month);
  if (f.departmentId) add("m.department_id = ?", f.departmentId);
  if (f.categoryId) add("o.category_id = ?", f.categoryId);
  if (f.memberTypeId) add("m.member_type_id = ?", f.memberTypeId);
  if (f.status) add("o.status = ?", f.status);
  if (f.method) add("t.method = ?", f.method);
  const from = f.dateFrom && isValidEthiopianDate(f.dateFrom) ? f.dateFrom : null;
  const to = f.dateTo && isValidEthiopianDate(f.dateTo) ? f.dateTo : null;
  const r = etRangeToInstants(from, to);
  const col = f.dateBasis === "period" ? ["p.period_end", "p.period_start"] : ["t.paid_at", "t.paid_at"];
  // period basis: the period overlaps [from, to). paid basis: payment timestamp lies inside the range.
  if (r.from) add(`${col[0]} > ?`, r.from);
  if (r.toExclusive) add(`${col[1]} < ?`, r.toExclusive);
  w += searchClause(f.search, params);
  return w;
}

export async function detailRows(f: ReportFilters, paginate = true) {
  const params: unknown[] = [];
  const where = buildWhere(f, params);
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const total = (await query(`select count(*)::int n ${FROM} ${where}`, params)).rows[0].n as number;
  const sums = (await query(
    `select coalesce(sum(o.amount),0) expected,
            coalesce(sum(ti.amount) filter (where t.status='VERIFIED'),0) collected ${FROM} ${where}`, params)).rows[0];
  const limit = paginate ? ` limit ${size} offset ${(page - 1) * size}` : " limit 50000";
  const { rows } = await query(
    `select o.id, m.id as member_id, m.member_code, u.full_name, u.phone, d.name as department, c.name as category, mt.name as member_type,
            o.ethiopian_year, o.ethiopian_month, o.amount as expected, o.status,
            case when t.status = 'VERIFIED' then ti.amount else 0 end as paid,
            t.method, t.reference_no, t.paid_at
       ${FROM} ${where}
      order by o.ethiopian_year, o.ethiopian_month, m.member_code ${limit}`, params);
  return { total, page, pageSize: size, rows, expected: Number(sums.expected), collected: Number(sums.collected) };
}

const GROUPS: Record<string, { key: string; label: string; order: string }> = {
  month: { key: "o.ethiopian_year * 100 + o.ethiopian_month", label: "o.ethiopian_month", order: "1" },
  department: { key: "d.id", label: "d.name", order: "2" },
  category: { key: "c.id", label: "c.name", order: "2" },
  memberType: { key: "mt.id", label: "mt.name", order: "2" },
  method: { key: "coalesce(t.method,'-')", label: "coalesce(t.method,'-')", order: "1" },
};
const AGG = `
  count(*)::int as obligations,
  count(distinct m.id)::int as members,
  count(distinct m.id) filter (where o.status = 'PAID')::int as members_paid,
  count(distinct m.id) filter (where o.status in ('UNPAID','REJECTED'))::int as members_unpaid,
  count(distinct m.id) filter (where o.status = 'PENDING')::int as members_pending,
  count(*) filter (where o.status = 'PAID')::int as paid_count,
  count(*) filter (where o.status = 'PENDING')::int as pending_count,
  count(*) filter (where o.status in ('UNPAID','REJECTED'))::int as unpaid_count,
  coalesce(sum(o.amount), 0) as expected,
  coalesce(sum(ti.amount) filter (where t.status = 'VERIFIED'), 0) as collected,
  coalesce(sum(o.amount) filter (where o.status = 'PENDING'), 0) as pending_amount,
  coalesce(sum(o.amount) filter (where o.status in ('UNPAID','REJECTED')), 0) as unpaid_amount`;

export async function summary(f: ReportFilters, groupBy: keyof typeof GROUPS | "none" = "none") {
  const params: unknown[] = [];
  const where = buildWhere(f, params);
  const totals = (await query(`select ${AGG} ${FROM} ${where}`, params)).rows[0];
  let groups: any[] = [];
  if (groupBy !== "none") {
    const g = GROUPS[groupBy];
    groups = (await query(
      `select ${g.key} as key, ${g.label} as label, min(o.ethiopian_year) as year, ${AGG} ${FROM} ${where} group by 1, 2 order by ${g.order}`, params)).rows;
  }
  return { totals, groups };
}

// ───────── annual matrix (members × 13 months) ─────────
export interface MatrixFilters extends ReportFilters { active?: "1" | "0" | "all" }

export async function matrix(f: MatrixFilters) {
  const year = f.year ?? currentPeriod().year;
  const params: unknown[] = [];
  let w = " where true";
  const add = (sql: string, val: unknown) => { params.push(val); w += ` and ${sql.replace("?", `$${params.length}`)}`; };
  if (f.departmentId) add("m.department_id = ?", f.departmentId);
  if (f.categoryId) add("m.category_id = ?", f.categoryId);
  if (f.memberTypeId) add("m.member_type_id = ?", f.memberTypeId);
  if ((f.active ?? "1") === "1") w += " and m.is_active"; else if (f.active === "0") w += " and not m.is_active";
  w += searchClause(f.search, params);
  if (f.status || f.month) {
    params.push(year); const y = params.length;
    let ex = `exists (select 1 from payment_obligations x where x.member_id = m.id and x.ethiopian_year = $${y}`;
    if (f.status) { params.push(f.status); ex += ` and x.status = $${params.length}`; }
    if (f.month) { params.push(f.month); ex += ` and x.ethiopian_month = $${params.length}`; }
    w += " and " + ex + ")";
  }
  const base = `from members m join users u on u.id = m.user_id join service_departments d on d.id = m.department_id
                join payment_categories c on c.id = m.category_id join member_types mt on mt.id = m.member_type_id`;
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const total = (await query(`select count(*)::int n ${base} ${w}`, params)).rows[0].n as number;
  const members = (await query(
    `select m.id, m.member_code, u.full_name, u.phone, m.is_active, d.name as department, c.name as category, mt.name as member_type
       ${base} ${w} order by m.member_code limit ${size} offset ${(page - 1) * size}`, params)).rows;
  const cells = members.length
    ? (await query(
        `select member_id, ethiopian_month, status, amount from payment_obligations where ethiopian_year = $1 and member_id = any($2::int[])`,
        [year, members.map((m) => m.id)])).rows
    : [];
  const byMember = new Map<number, any[]>();
  for (const m of members) byMember.set(m.id, Array(13).fill(null));
  for (const c of cells) byMember.get(c.member_id)![c.ethiopian_month - 1] = { status: c.status, amount: Number(c.amount) };
  const rows = members.map((m) => {
    const months = byMember.get(m.id)!;
    const paid = months.reduce((s, c) => s + (c?.status === "PAID" ? c.amount : 0), 0);
    const open = months.reduce((s, c) => s + (c && c.status !== "PAID" ? c.amount : 0), 0);
    return { ...m, months, paid, open };
  });
  return { year, total, page, pageSize: size, rows };
}

// ───────── dashboard ─────────
export async function dashboard() {
  const cur = currentPeriod();
  const month = (await query(
    `select count(distinct m.id)::int as members,
            count(distinct m.id) filter (where o.status='PAID')::int as paid,
            count(distinct m.id) filter (where o.status in ('UNPAID','REJECTED'))::int as unpaid,
            count(distinct m.id) filter (where o.status='PENDING')::int as pending
       from members m left join payment_obligations o on o.member_id = m.id and o.ethiopian_year=$1 and o.ethiopian_month=$2
      where m.is_active`, [cur.year, cur.month])).rows[0];
  const collected = (await query(
    `select coalesce(sum(i.amount),0) as year_total,
            coalesce(sum(i.amount) filter (where o.ethiopian_month = $2),0) as month_total
       from payment_transaction_items i join payment_transactions t on t.id=i.transaction_id and t.status='VERIFIED'
       join payment_obligations o on o.id = i.obligation_id where i.is_active and o.ethiopian_year=$1`, [cur.year, cur.month])).rows[0];
  const totalMembers = (await query("select count(*)::int n from members where is_active")).rows[0].n;
  const pendingCount = (await query("select count(*)::int n from payment_transactions where status='PENDING'")).rows[0].n;
  return { period: cur, totalMembers, month, collected: { year: Number(collected.year_total), month: Number(collected.month_total) }, pendingCount };
}
