import { describe, expect, it } from "vitest";
import {
  daysInMonth, ETHIOPIAN_MONTHS, formatEthiopianDate, formatInstant, formatPeriod, fromEthiopian, isLeapYear,
  isValidEthiopianDate, nextDay, toEthiopian,
} from "../shared/calendar/ethiopian";
import { currentPeriod, etRangeToInstants, nextPeriod, paymentDateFields, periodEnd, periodStart, yearRange } from "../shared/calendar/payment-period";

describe("Ethiopian calendar (abushakir)", () => {
  it("has 13 months with the required spelling", () => {
    expect(ETHIOPIAN_MONTHS).toHaveLength(13);
    expect(ETHIOPIAN_MONTHS[3]).toBe("ታኅሣሥ");
    expect(ETHIOPIAN_MONTHS[12]).toBe("ጳጉሜን");
  });

  it("2019 E.C. starts on 11 September 2026 (Addis Ababa) – Ethiopian New Year", () => {
    const start = fromEthiopian({ year: 2019, month: 1, day: 1 });
    // 00:00 Addis Ababa = 21:00 UTC the day before
    expect(start.toISOString()).toBe("2026-09-10T21:00:00.000Z");
    expect(toEthiopian(start)).toMatchObject({ year: 2019, month: 1, day: 1, hour: 0 });
  });

  it("converts Gregorian → Ethiopian for known dates", () => {
    expect(toEthiopian(new Date("2026-10-03T09:00:00Z"))).toMatchObject({ year: 2019, month: 1, day: 23 });
    expect(toEthiopian(new Date("2024-09-11T09:00:00Z"))).toMatchObject({ year: 2017, month: 1, day: 1 });
    expect(toEthiopian(new Date("2023-09-12T09:00:00Z"))).toMatchObject({ year: 2016, month: 1, day: 1 });
  });

  it("month lengths: 30 days, ጳጉሜን 5 or 6", () => {
    for (let m = 1; m <= 12; m++) expect(daysInMonth(2019, m)).toBe(30);
    expect(daysInMonth(2018, 13)).toBe(5);
    expect(daysInMonth(2019, 13)).toBe(6); // leap year
    expect(daysInMonth(2015, 13)).toBe(6);
    expect(daysInMonth(2020, 13)).toBe(5);
    expect(isLeapYear(2019)).toBe(true);
    expect(isLeapYear(2018)).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(isValidEthiopianDate({ year: 2018, month: 13, day: 6 })).toBe(false);
    expect(isValidEthiopianDate({ year: 2019, month: 13, day: 6 })).toBe(true);
    expect(isValidEthiopianDate({ year: 2019, month: 2, day: 31 })).toBe(false);
    expect(() => fromEthiopian({ year: 2018, month: 13, day: 6 })).toThrow();
  });

  it("round-trips Ethiopian → Gregorian → Ethiopian for every day of 2019–2022", () => {
    for (let year = 2019; year <= 2022; year++)
      for (let month = 1; month <= 13; month++)
        for (let day = 1; day <= daysInMonth(year, month); day++) {
          const back = toEthiopian(fromEthiopian({ year, month, day }));
          expect([back.year, back.month, back.day]).toEqual([year, month, day]);
        }
  });

  it("round-trips Gregorian → Ethiopian → Gregorian (start of the Ethiopian day)", () => {
    const base = Date.parse("2026-09-10T21:00:00Z"); // 2019/1/1 00:00 Addis
    for (let i = 0; i < 800; i++) {
      const t = base + i * 86400000;
      const e = toEthiopian(t);
      expect(fromEthiopian(e).getTime()).toBe(t);
    }
  });

  it("payment exactly at Ethiopian midnight belongs to the new day", () => {
    const midnight = fromEthiopian({ year: 2019, month: 2, day: 1 });
    expect(toEthiopian(midnight)).toMatchObject({ month: 2, day: 1, hour: 0, minute: 0 });
    expect(toEthiopian(new Date(midnight.getTime() - 1))).toMatchObject({ month: 1, day: 30, hour: 23, minute: 59 });
  });

  it("payment near month boundary & New Year", () => {
    const lastSecondOfYear = new Date(fromEthiopian({ year: 2019, month: 13, day: 6 }).getTime() + 86400000 - 1000);
    expect(toEthiopian(lastSecondOfYear)).toMatchObject({ year: 2019, month: 13, day: 6, hour: 23, minute: 59, second: 59 });
    const newYear = new Date(lastSecondOfYear.getTime() + 1000);
    expect(toEthiopian(newYear)).toMatchObject({ year: 2020, month: 1, day: 1 });
    expect(paymentDateFields(newYear)).toEqual({ ethiopian_year: 2020, ethiopian_month: 1, ethiopian_day: 1 });
  });

  it("wall-clock is Addis Ababa, not UTC (21:00Z is already tomorrow)", () => {
    expect(toEthiopian(new Date("2026-10-02T20:59:59Z")).day).toBe(22);
    expect(toEthiopian(new Date("2026-10-02T21:00:00Z")).day).toBe(23);
  });

  it("formats Amharic dates", () => {
    expect(formatEthiopianDate({ year: 2019, month: 2, day: 12 })).toBe("12 ጥቅምት 2019 ዓ.ም.");
    expect(formatPeriod(2019, 1)).toBe("2019 ዓ.ም. መስከረም");
    expect(formatInstant(fromEthiopian({ year: 2019, month: 2, day: 12, hour: 15, minute: 45 }), true)).toBe("12 ጥቅምት 2019 ዓ.ም. 15:45");
    expect(formatInstant(null)).toBe("—");
  });

  it("payment periods are contiguous and Ethiopian-based", () => {
    let p = { year: 2019, month: 1 };
    for (let i = 0; i < 40; i++) {
      expect(periodEnd(p).getTime()).toBe(periodStart(nextPeriod(p)).getTime());
      p = nextPeriod(p);
    }
    expect(nextPeriod({ year: 2019, month: 13 })).toEqual({ year: 2020, month: 1 });
    // the 2019 year spans 366 days (leap)
    const days = (periodEnd({ year: 2019, month: 13 }).getTime() - periodStart({ year: 2019, month: 1 }).getTime()) / 86400000;
    expect(days).toBe(366);
  });

  it("current period is derived from the supplied clock (historical, current and future)", () => {
    expect(currentPeriod(new Date("2026-10-03T09:00:00Z"))).toEqual({ year: 2019, month: 1 });
    expect(currentPeriod(new Date("2027-09-12T09:00:00Z"))).toEqual({ year: 2020, month: 1 });
    expect(yearRange(2019, new Date("2026-10-03T09:00:00Z"))).toEqual([2019, 2020]);
    expect(yearRange(2019, new Date("2030-10-03T09:00:00Z"), 0).at(-1)).toBeGreaterThan(2019);
  });

  it("Ethiopian date range → instants (inclusive whole days)", () => {
    const r = etRangeToInstants({ year: 2019, month: 1, day: 1 }, { year: 2019, month: 2, day: 30 });
    expect(r.from!.getTime()).toBe(periodStart({ year: 2019, month: 1 }).getTime());
    expect(r.toExclusive!.getTime()).toBe(periodStart({ year: 2019, month: 3 }).getTime());
    expect(nextDay({ year: 2019, month: 13, day: 6 })).toEqual({ year: 2020, month: 1, day: 1 });
    expect(nextDay({ year: 2018, month: 13, day: 5 })).toEqual({ year: 2019, month: 1, day: 1 });
  });
});
