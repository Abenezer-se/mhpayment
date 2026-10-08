import { Db, query } from "../db";
import { MONTHS_IN_YEAR } from "../../shared/calendar/ethiopian";
import { currentPeriod, periodEnd, periodStart } from "../../shared/calendar/payment-period";
import { getSettings } from "./settings";

/** SQL expression for the ordering key of a (year, month) pair. */
export const ord = (y: string, m: string) => `(${y} * ${MONTHS_IN_YEAR} + ${m})`;

/** Make sure payment_periods has all 13 months for the given Ethiopian years (boundaries come from the calendar service). */
export async function ensurePeriods(db: Db, fromYear: number, toYear: number) {
  const { billPagumen } = await getSettings(db);
  const y: number[] = [], m: number[] = [], s: string[] = [], e: string[] = [], b: boolean[] = [];
  for (let year = fromYear; year <= toYear; year++)
    for (let month = 1; month <= MONTHS_IN_YEAR; month++) {
      y.push(year); m.push(month);
      s.push(periodStart({ year, month }).toISOString()); e.push(periodEnd({ year, month }).toISOString());
      b.push(month !== MONTHS_IN_YEAR || billPagumen);
    }
  await query(
    `insert into payment_periods (ethiopian_year, ethiopian_month, period_start, period_end, is_billable)
     select * from unnest($1::int[], $2::smallint[], $3::timestamptz[], $4::timestamptz[], $5::boolean[])
     on conflict (ethiopian_year, ethiopian_month) do nothing`, [y, m, s, e, b], db);
}

/** Periods from the system's first year to next year (so a year-end rollover never finds a gap). */
export async function ensureCurrentPeriods(db: Db) {
  const { systemStartYear } = await getSettings(db);
  await ensurePeriods(db, systemStartYear, currentPeriod().year + 1);
}
