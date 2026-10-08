import { query } from "../db";
import { MONTHS_IN_YEAR } from "../../shared/calendar/ethiopian";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { groupMonths, toOrd } from "../../shared/month-groups";
import { badRequest } from "../lib/errors";
import { searchClause } from "./members";
import { ord } from "./periods";
import { getSettings } from "./settings";

export type FollowStatus = "all" | "paid" | "unpaid" | "partial";
export interface PeriodPick { year: number; month: number }
export interface FollowUpFilters {
  search?: string; departmentId?: number; categoryId?: number; status?: FollowStatus;
  from?: PeriodPick; to?: PeriodPick; includePending?: boolean; page?: number; pageSize?: number;
}
export interface Group { label: string; count: number; amount: number }

/**
 * Payment follow-up: ONE row per member with the months grouped.
 *  - paid    = months whose payment was verified (PAID)
 *  - unpaid  = months UNPAID / REJECTED (and PENDING too, only if includePending)
 *  - pending = screenshot waiting for review: never counted as paid
 * Amounts are the prices frozen on each monthly obligation, so a later price change never alters history.
 */
export async function runFollowUp(f: FollowUpFilters, paginate = true) {
  const settings = await getSettings();
  const from = f.from ?? { year: settings.systemStartYear, month: 1 };
  const to = f.to ?? currentPeriod();
  for (const p of [from, to]) if (!Number.isInteger(p.year) || p.month < 1 || p.month > MONTHS_IN_YEAR) throw badRequest("የወር ክልሉ ትክክል አይደለም።");
  if (toOrd(from.year, from.month) > toOrd(to.year, to.month)) throw badRequest("የመነሻ ወር ከመጨረሻው ወር በኋላ ሊሆን አይችልም።");

  const params: unknown[] = [toOrd(from.year, from.month), toOrd(to.year, to.month)];
  const unpaidSet = f.includePending ? "('UNPAID','REJECTED','PENDING')" : "('UNPAID','REJECTED')";
  let w = " where m.is_active";
  if (f.departmentId) { params.push(f.departmentId); w += ` and m.department_id = $${params.length}`; }
  if (f.categoryId) { params.push(f.categoryId); w += ` and m.category_id = $${params.length}`; }
  w += searchClause(f.search, params);

  const periods = (o: string, set: string) =>
    `coalesce(array_agg(${ord("o.ethiopian_year", "o.ethiopian_month")} order by o.ethiopian_year, o.ethiopian_month) filter (where o.status ${set}), '{}'::int[])`;
  const cte = `with pm as (
    select m.id, m.member_code, u.full_name, d.name as department, c.name as category,
           count(o.id) filter (where o.status = 'PAID')::int as paid_count,
           coalesce(sum(o.amount) filter (where o.status = 'PAID'), 0) as paid_amount,
           count(o.id) filter (where o.status in ${unpaidSet})::int as unpaid_count,
           coalesce(sum(o.amount) filter (where o.status in ${unpaidSet}), 0) as unpaid_amount,
           count(o.id) filter (where o.status = 'PENDING')::int as pending_count,
           coalesce(sum(o.amount) filter (where o.status = 'PENDING'), 0) as pending_amount,
           ${periods("o", "= 'PAID'")} as paid_periods,
           ${periods("o", `in ${unpaidSet}`)} as unpaid_periods,
           ${periods("o", "= 'PENDING'")} as pending_periods
      from members m
      join users u on u.id = m.user_id
      join service_departments d on d.id = m.department_id
      join payment_categories c on c.id = m.category_id
      left join payment_obligations o on o.member_id = m.id and ${ord("o.ethiopian_year", "o.ethiopian_month")} between $1 and $2
      ${w}
      group by m.id, u.full_name, d.name, c.name)`;

  const statusWhere = { all: "", paid: " where unpaid_count = 0 and paid_count > 0", unpaid: " where unpaid_count > 0", partial: " where unpaid_count > 0 and paid_count > 0" }[f.status ?? "all"];

  const sum = (await query(
    `${cte} select count(*)::int as total,
            count(*) filter (where unpaid_count = 0 and paid_count > 0)::int as paid,
            count(*) filter (where unpaid_count > 0)::int as unpaid,
            count(*) filter (where unpaid_count > 0 and paid_count > 0)::int as partial,
            coalesce(sum(unpaid_amount), 0) as unpaid_amount, coalesce(sum(paid_amount), 0) as paid_amount from pm`, params)).rows[0];
  const total = (await query(`${cte} select count(*)::int as n from pm${statusWhere}`, params)).rows[0].n as number;
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const limit = paginate ? ` limit ${size} offset ${(page - 1) * size}` : " limit 20000";
  const raw = (await query(`${cte} select * from pm${statusWhere} order by member_code${limit}`, params)).rows;

  // position of each billable period → "consecutive" is judged among billable months only
  const billable = (await query("select ethiopian_year * 13 + ethiopian_month as o from payment_periods where is_billable order by 1")).rows;
  const position = new Map<number, number>(billable.map((r: any, i: number) => [r.o as number, i]));
  const idxOf = (o: number) => position.get(o) ?? o * 1000;
  const showYear = from.year !== to.year;
  const grp = (periodsArr: number[], amount: number): Group => ({ label: groupMonths(periodsArr, idxOf, showYear).label, count: periodsArr.length, amount: Number(amount) });

  const rows = raw.map((r: any) => ({
    id: r.id as number, member_code: r.member_code as string, full_name: r.full_name as string, department: r.department as string, category: r.category as string,
    paid: grp(r.paid_periods, r.paid_amount), unpaid: grp(r.unpaid_periods, r.unpaid_amount), pending: grp(r.pending_periods, r.pending_amount),
  }));
  return {
    summary: { total: sum.total as number, paid: sum.paid as number, unpaid: sum.unpaid as number, partial: sum.partial as number, unpaidAmount: Number(sum.unpaid_amount), paidAmount: Number(sum.paid_amount) },
    rows, total, page, pageSize: size, period: { from, to }, showYear,
  };
}