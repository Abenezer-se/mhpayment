/**
 * THE single place for Ethiopian-calendar operations.
 * All conversion maths is delegated to the `abushakir` package — nothing is calculated by hand here.
 *
 * Model:
 *  - A real moment in time is a JS timestamp (stored in the DB as timestamptz).
 *  - The *Ethiopian civil date* of that moment is evaluated in the Africa/Addis_Ababa time zone.
 *  - abushakir treats its `moment` as "wall-clock expressed as UTC", so we move between an
 *    instant and its Addis Ababa wall-clock with Intl (no hard-coded offsets).
 */
import { EtDatetime, ETC } from "abushakir";

export const TIME_ZONE = "Africa/Addis_Ababa";

/** The 13 Ethiopian months (index 0 = month 1). Spelling as required by the organisation. */
export const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት",
  "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን",
] as const;

export const MONTHS_IN_YEAR = ETHIOPIAN_MONTHS.length; // 13
export const PAGUME = 13;

export interface EtDate { year: number; month: number; day: number }
export interface EtDateTime extends EtDate { hour: number; minute: number; second: number }

export function monthName(month: number): string {
  const n = ETHIOPIAN_MONTHS[month - 1];
  if (!n) throw new Error(`Invalid Ethiopian month: ${month}`);
  return n;
}

/** Ordering key for (year, month). Used only for comparing/sorting periods. */
export const periodOrdinal = (year: number, month: number) => year * MONTHS_IN_YEAR + month;

// ───────────── instant <-> Addis Ababa wall-clock ─────────────

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Wall-clock (in Addis Ababa) of an instant, expressed as a UTC millisecond value. */
function wallClockMs(instant: Date | number): number {
  const t = typeof instant === "number" ? instant : instant.getTime();
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, ((t % 1000) + 1000) % 1000);
}

const zoneOffsetMs = (instant: number): number => wallClockMs(instant) - instant;

/** Inverse of wallClockMs: which instant shows this wall-clock in Addis Ababa? */
function instantFromWallClock(wallMs: number): Date {
  let guess = wallMs - zoneOffsetMs(wallMs);
  guess = wallMs - zoneOffsetMs(guess);
  return new Date(guess);
}

// ───────────── public conversions ─────────────

/** Gregorian instant → Ethiopian date & time (Addis Ababa wall-clock). */
export function toEthiopian(instant: Date | number | string): EtDateTime {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === "string" ? Date.parse(instant) : instant;
  if (Number.isNaN(ms)) throw new Error("Invalid date");
  const et = new EtDatetime(wallClockMs(ms));
  return { year: et.year, month: et.month, day: et.day, hour: et.hour, minute: et.minute, second: et.second };
}

export function isValidEthiopianDate({ year, month, day }: EtDate): boolean {
  if (![year, month, day].every(Number.isInteger)) return false;
  if (year < 1 || month < 1 || month > MONTHS_IN_YEAR || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Ethiopian date/time (Addis Ababa wall-clock) → the real instant. */
export function fromEthiopian(d: EtDate & Partial<Pick<EtDateTime, "hour" | "minute" | "second">>): Date {
  if (!isValidEthiopianDate(d)) throw new Error(`Invalid Ethiopian date ${d.year}-${d.month}-${d.day}`);
  const et = new EtDatetime(d.year, d.month, d.day, d.hour ?? 0, d.minute ?? 0, d.second ?? 0, 0);
  return instantFromWallClock(et.moment);
}

/** Number of days in an Ethiopian month (30, or 5/6 for ጳጉሜን) — straight from abushakir. */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > MONTHS_IN_YEAR) return 0;
  return new ETC(year, month).monthDays().length;
}

export const isLeapYear = (year: number) => new EtDatetime(year, 1, 1, 0, 0, 0, 0).isLeap;

export function nextDay(d: EtDate): EtDate {
  if (d.day < daysInMonth(d.year, d.month)) return { ...d, day: d.day + 1 };
  return d.month === MONTHS_IN_YEAR ? { year: d.year + 1, month: 1, day: 1 } : { year: d.year, month: d.month + 1, day: 1 };
}

export function nowEthiopian(now: Date | number = Date.now()): EtDateTime {
  return toEthiopian(now);
}

// ───────────── formatting (Amharic) ─────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "12 ጥቅምት 2019 ዓ.ም." */
export function formatEthiopianDate(d: EtDate): string {
  return `${d.day} ${monthName(d.month)} ${d.year} ዓ.ም.`;
}

/** "12 ጥቅምት 2019 ዓ.ም. 15:45" — from any instant. */
export function formatInstant(instant: Date | number | string | null | undefined, withTime = false): string {
  if (instant === null || instant === undefined || instant === "") return "—";
  const e = toEthiopian(instant);
  return formatEthiopianDate(e) + (withTime ? ` ${pad2(e.hour)}:${pad2(e.minute)}` : "");
}

/** "2019 ዓ.ም. ጥቅምት" */
export function formatPeriod(year: number, month: number): string {
  return `${year} ዓ.ም. ${monthName(month)}`;
}
