/**
 * Groups a member's months into ONE readable value, e.g. "መስከረም - ኅዳር" (instead of one row per month).
 * Month names come from the central Ethiopian-calendar module (abushakir).
 */
import { MONTHS_IN_YEAR, monthName } from "./calendar/ethiopian";

/** Ordering key of an Ethiopian (year, month). */
export const toOrd = (year: number, month: number) => year * MONTHS_IN_YEAR + month;
export function fromOrd(o: number) {
  const year = Math.floor((o - 1) / MONTHS_IN_YEAR);
  return { year, month: o - year * MONTHS_IN_YEAR };
}

export interface MonthGroups { label: string; count: number; runs: { from: number; to: number }[] }

/**
 * @param idxOf position of an ordinal among the billable periods: two months are "consecutive" when their
 *              positions are adjacent (so ኅዳር→ታኅሣሥ is a run, and ነሐሴ→መስከረም is a run when ጳጉሜን is not billed).
 * @param showYear add the year to the labels (used when the report covers more than one Ethiopian year)
 */
export function groupMonths(ords: number[], idxOf: (ord: number) => number, showYear: boolean): MonthGroups {
  const sorted = [...new Set(ords)].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (const o of sorted) {
    const last = runs[runs.length - 1];
    if (last && idxOf(o) - idxOf(last.to) === 1) last.to = o; else runs.push({ from: o, to: o });
  }
  const text = (r: { from: number; to: number }) => {
    const a = fromOrd(r.from), b = fromOrd(r.to);
    if (r.from === r.to) return showYear ? `${monthName(a.month)} ${a.year}` : monthName(a.month);
    if (a.year === b.year) return `${monthName(a.month)} - ${monthName(b.month)}${showYear ? ` ${a.year}` : ""}`;
    return `${monthName(a.month)} ${a.year} - ${monthName(b.month)} ${b.year}`;
  };
  return { label: runs.map(text).join("፣ "), count: sorted.length, runs };
}