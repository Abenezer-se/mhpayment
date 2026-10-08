import {
  EtDate, fromEthiopian, MONTHS_IN_YEAR, nextDay, nowEthiopian, periodOrdinal, toEthiopian,
} from "./ethiopian";

export interface Period { year: number; month: number }

export const periodStart = (p: Period): Date => fromEthiopian({ year: p.year, month: p.month, day: 1 });

export function nextPeriod(p: Period): Period {
  return p.month === MONTHS_IN_YEAR ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 };
}

/** Exclusive end: the first instant of the following period. */
export const periodEnd = (p: Period): Date => periodStart(nextPeriod(p));

export function currentPeriod(now: Date | number = Date.now()): Period {
  const e = nowEthiopian(now);
  return { year: e.year, month: e.month };
}

export const comparePeriods = (a: Period, b: Period) => periodOrdinal(a.year, a.month) - periodOrdinal(b.year, b.month);

/** Selectable Ethiopian years: from the system's first year up to (current year + ahead). */
export function yearRange(startYear: number, now: Date | number = Date.now(), ahead = 1): number[] {
  const last = currentPeriod(now).year + ahead;
  const out: number[] = [];
  for (let y = startYear; y <= last; y++) out.push(y);
  return out;
}

/**
 * Ethiopian date range (inclusive, whole days) → [fromInstant, toInstantExclusive) for DB queries.
 */
export function etRangeToInstants(from?: EtDate | null, to?: EtDate | null): { from?: Date; toExclusive?: Date } {
  return {
    from: from ? fromEthiopian(from) : undefined,
    toExclusive: to ? fromEthiopian(nextDay(to)) : undefined,
  };
}

/** All Ethiopian calendar fields of a payment timestamp, ready to persist. */
export function paymentDateFields(at: Date) {
  const e = toEthiopian(at);
  return { ethiopian_year: e.year, ethiopian_month: e.month, ethiopian_day: e.day };
}
