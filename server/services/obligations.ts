import { Db, query, tx } from "../db";
import { MONTHS_IN_YEAR } from "../../shared/calendar/ethiopian";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { badRequest } from "../lib/errors";
import { ensureCurrentPeriods, ensurePeriods, ord } from "./periods";
import { getRawSetting, getSettings, setSetting } from "./settings";

const RULE_LATERAL = (cat: string, y: string, m: string) => `
  (select r.amount from payment_rules r
    where r.category_id = ${cat} and ${ord("r.effective_year", "r.effective_month")} <= ${ord(y, m)}
    order by r.effective_year desc, r.effective_month desc, r.id desc limit 1)`;

/** Amount that applies to a payment category for a period (from the price history). */
export async function applicableAmount(db: Db, categoryId: number, year: number, month: number): Promise<number | null> {
  const { rows } = await query(
    `select r.amount from payment_rules r
      where r.category_id = $1 and ${ord("r.effective_year", "r.effective_month")} <= ${ord("$2::int", "$3::int")}
      order by r.effective_year desc, r.effective_month desc, r.id desc limit 1`, [categoryId, year, month], db);
  return rows[0] ? Number(rows[0].amount) : null;
}

/**
 * Creates missing monthly obligations (idempotent, set-based) from max(registration month, fromOrd)
 * to the END of the current Ethiopian year. Each obligation freezes the amount valid for its period.
 */
export async function generateObligations(db: Db, opts: { memberId?: number; fromOrd?: number } = {}) {
  const { systemStartYear } = await getSettings(db);
  const cur = currentPeriod();
  await ensurePeriods(db, systemStartYear, cur.year + 1);
  const startOrd = opts.fromOrd ?? systemStartYear * MONTHS_IN_YEAR + 1;
  const endOrd = cur.year * MONTHS_IN_YEAR + MONTHS_IN_YEAR;
  const res = await query(
    `insert into payment_obligations (member_id, period_id, ethiopian_year, ethiopian_month, category_id, amount)
     select m.id, p.id, p.ethiopian_year, p.ethiopian_month, m.category_id, ${RULE_LATERAL("m.category_id", "p.ethiopian_year", "p.ethiopian_month")}
       from members m
       join payment_periods p on p.is_billable
        and ${ord("p.ethiopian_year", "p.ethiopian_month")} >= greatest(${ord("m.registered_year", "m.registered_month")}, $1::int)
        and ${ord("p.ethiopian_year", "p.ethiopian_month")} <= $2::int
      where m.is_active and ($3::int is null or m.id = $3)
        and ${RULE_LATERAL("m.category_id", "p.ethiopian_year", "p.ethiopian_month")} is not null
     on conflict (member_id, ethiopian_year, ethiopian_month) do nothing`,
    [startOrd, endOrd, opts.memberId ?? null], db);
  return res.rowCount ?? 0;
}

/** When a new Ethiopian year begins, create that year's obligations for everybody — once, lazily. */
export async function ensureYearGenerated() {
  const cur = currentPeriod();
  const done = await getRawSetting<number>(await import("../db").then((m) => m.getPool()), "obligations_generated_year");
  if (done !== null && done >= cur.year) return;
  await tx(async (c) => {
    await query("select pg_advisory_xact_lock(7001)", [], c);
    const again = await getRawSetting<number>(c, "obligations_generated_year");
    if (again !== null && again >= cur.year) return;
    await ensureCurrentPeriods(c);
    await generateObligations(c);
    await setSetting(c, "obligations_generated_year", cur.year, null);
  });
}

/**
 * Re-price obligations that are still open (UNPAID / REJECTED) from a given period onward.
 * PAID and PENDING obligations and everything before `fromOrd` are never touched (history is frozen).
 */
export async function repriceOpenObligations(db: Db, opts: { categoryId?: number; memberId?: number; fromOrd: number }) {
  const res = await query(
    `update payment_obligations o
        set amount = ${RULE_LATERAL("m.category_id", "o.ethiopian_year", "o.ethiopian_month")}, category_id = m.category_id, updated_at = now()
       from members m
      where m.id = o.member_id and o.status in ('UNPAID','REJECTED')
        and ${ord("o.ethiopian_year", "o.ethiopian_month")} >= $1::int
        and ($2::int is null or m.category_id = $2)
        and ($3::int is null or m.id = $3)
        and ${RULE_LATERAL("m.category_id", "o.ethiopian_year", "o.ethiopian_month")} is not null`,
    [opts.fromOrd, opts.categoryId ?? null, opts.memberId ?? null], db);
  return res.rowCount ?? 0;
}

export async function assertCategoryHasPrice(db: Db, categoryId: number) {
  const cur = currentPeriod();
  const a = await applicableAmount(db, categoryId, cur.year, cur.month);
  if (a === null) throw badRequest("ለዚህ የክፍያ ምድብ የክፍያ መጠን አልተቀመጠም። መጀመሪያ በ«የክፍያ ቅንብር» ያስገቡ።");
}
