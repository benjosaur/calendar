import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  toCivil,
  fromCivilParts,
  civilForInstant,
  wallToUtcMs,
  minutesOfDay,
  weekBounds,
  minutesToPx,
  pxToMinutes,
  snapMinutes,
  DAY_START_MIN,
  DAY_END_MIN,
  SNAP_MIN,
} from "../src/lib/time";

describe("civil <-> epoch round trips", () => {
  it("toCivil / fromCivilParts round trip", () => {
    const civil = 20260604;
    const { y, m, d } = fromCivilParts(civil);
    expect({ y, m, d }).toEqual({ y: 2026, m: 6, d: 4 });
    expect(toCivil(DateTime.fromObject({ year: y, month: m, day: d }))).toBe(civil);
  });

  it("civilForInstant matches the civil used to build the instant", () => {
    const tz = "Europe/London";
    const civil = 20260615;
    const ms = wallToUtcMs(civil, 9 * 60, tz);
    expect(civilForInstant(ms, tz)).toBe(civil);
  });
});

describe("weekBounds", () => {
  it("is Monday-based with 7 days and exclusive end", () => {
    const tz = "Europe/London";
    // 2026-06-04 is a Thursday.
    const ref = DateTime.fromObject({ year: 2026, month: 6, day: 4 }, { zone: tz }).toMillis();
    const wb = weekBounds(tz, ref);
    expect(wb.dayCivils).toHaveLength(7);
    expect(wb.days).toHaveLength(7);
    // Monday of that week is 2026-06-01.
    expect(wb.dayCivils[0]).toBe(20260601);
    expect(wb.dayCivils[6]).toBe(20260607);
    expect(wb.days[0].weekday).toBe(1); // Monday
    // weekEndMs is the following Monday 00:00.
    expect(DateTime.fromMillis(wb.weekEndMs, { zone: tz }).toMillis()).toBe(
      DateTime.fromObject({ year: 2026, month: 6, day: 8 }, { zone: tz }).toMillis(),
    );
    expect(wb.weekEndMs).toBeGreaterThan(wb.weekStartMs);
  });
});

describe("px <-> minute round trips", () => {
  it("minutesToPx / pxToMinutes round trip", () => {
    for (const min of [0, 90, 540, 720, 1439]) {
      expect(pxToMinutes(minutesToPx(min))).toBeCloseTo(min, 6);
    }
  });
});

describe("snapMinutes", () => {
  it("snaps to nearest SNAP_MIN (within the visible window)", () => {
    const base = 9 * 60; // 09:00, inside the 07:00–24:00 window
    expect(snapMinutes(base + 7)).toBe(base);
    expect(snapMinutes(base + 8)).toBe(base + SNAP_MIN);
    expect(snapMinutes(base + 22)).toBe(base + SNAP_MIN);
    expect(snapMinutes(base + 23)).toBe(base + 30);
  });
  it("clamps to the visible window", () => {
    expect(snapMinutes(-100)).toBe(DAY_START_MIN); // 07:00
    expect(snapMinutes(60)).toBe(DAY_START_MIN); // 01:00 is before the window
    expect(snapMinutes(99999)).toBe(DAY_END_MIN); // 24:00
  });
});

describe("wallToUtcMs / minutesOfDay round trip", () => {
  it("recovers the original minutes-of-day", () => {
    const tz = "America/New_York";
    const civil = 20260710;
    for (const min of [0, 9 * 60, 13 * 60 + 45, 23 * 60 + 30]) {
      const ms = wallToUtcMs(civil, min, tz);
      expect(minutesOfDay(ms, tz)).toBe(min);
    }
  });
});
