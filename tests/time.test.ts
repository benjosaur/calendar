import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  toCivil,
  fromCivilParts,
  civilForInstant,
  eventDaySegment,
  wallToUtcMs,
  minutesOfDay,
  timedOverlapsWindow,
  timedEventEndMs,
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

describe("eventDaySegment", () => {
  const tz = "Europe/London";
  // A multi-day timed event: Tue 2026-06-02 14:00 -> Thu 2026-06-04 15:00.
  const start = wallToUtcMs(20260602, 14 * 60, tz);
  const end = wallToUtcMs(20260604, 15 * 60, tz);

  it("renders the start day from the start minute to midnight", () => {
    const seg = eventDaySegment(start, end, 20260602, tz);
    expect(seg).toEqual({ topMin: 14 * 60, bottomMin: 24 * 60, isStart: true, isEnd: false });
  });

  it("renders an intervening day full height", () => {
    const seg = eventDaySegment(start, end, 20260603, tz);
    expect(seg).toEqual({ topMin: 0, bottomMin: 24 * 60, isStart: false, isEnd: false });
  });

  it("renders the end day from midnight to the end minute", () => {
    const seg = eventDaySegment(start, end, 20260604, tz);
    expect(seg).toEqual({ topMin: 0, bottomMin: 15 * 60, isStart: false, isEnd: true });
  });

  it("returns null for days outside the span", () => {
    expect(eventDaySegment(start, end, 20260601, tz)).toBeNull();
    expect(eventDaySegment(start, end, 20260605, tz)).toBeNull();
  });

  it("treats an end at exact local midnight as the previous day's 24:00", () => {
    const mEnd = wallToUtcMs(20260603, 0, tz); // Wed 00:00
    const mStart = wallToUtcMs(20260602, 22 * 60, tz); // Tue 22:00
    // Tuesday gets the full slice up to 24:00...
    expect(eventDaySegment(mStart, mEnd, 20260602, tz)).toEqual({
      topMin: 22 * 60,
      bottomMin: 24 * 60,
      isStart: true,
      isEnd: true,
    });
    // ...and Wednesday is untouched (no zero-height sliver).
    expect(eventDaySegment(mStart, mEnd, 20260603, tz)).toBeNull();
  });

  it("fills to end of day for a degenerate zero-duration event", () => {
    const z = wallToUtcMs(20260602, 9 * 60, tz);
    expect(eventDaySegment(z, z, 20260602, tz)).toEqual({
      topMin: 9 * 60,
      bottomMin: 24 * 60,
      isStart: true,
      isEnd: true,
    });
  });
});

describe("timedOverlapsWindow", () => {
  const tz = "Europe/London";
  // Visible week: Mon 8 Jun 2026 00:00 .. Mon 15 Jun 2026 00:00.
  const from = wallToUtcMs(20260608, 0, tz);
  const to = wallToUtcMs(20260615, 0, tz);

  it("includes a stay that begins in the prior week and runs into this one", () => {
    // Sun 7 Jun 09:00 -> Mon 8 Jun 12:00. Starts before the window but overlaps.
    const start = wallToUtcMs(20260607, 9 * 60, tz);
    const end = wallToUtcMs(20260608, 12 * 60, tz);
    expect(timedOverlapsWindow(start, end, from, to)).toBe(true);
  });

  it("includes an event fully inside the window", () => {
    const start = wallToUtcMs(20260610, 9 * 60, tz);
    const end = wallToUtcMs(20260610, 10 * 60, tz);
    expect(timedOverlapsWindow(start, end, from, to)).toBe(true);
  });

  it("includes an event running off the end of the window into next week", () => {
    const start = wallToUtcMs(20260614, 9 * 60, tz); // Sun
    const end = wallToUtcMs(20260616, 10 * 60, tz); // next Tue
    expect(timedOverlapsWindow(start, end, from, to)).toBe(true);
  });

  it("excludes an event ending exactly at the window start", () => {
    const start = wallToUtcMs(20260607, 9 * 60, tz);
    expect(timedOverlapsWindow(start, from, from, to)).toBe(false);
  });

  it("excludes an event starting exactly at the window end", () => {
    const end = wallToUtcMs(20260615, 10 * 60, tz);
    expect(timedOverlapsWindow(to, end, from, to)).toBe(false);
  });

  it("excludes an event wholly before the window", () => {
    const start = wallToUtcMs(20260601, 9 * 60, tz);
    const end = wallToUtcMs(20260601, 10 * 60, tz);
    expect(timedOverlapsWindow(start, end, from, to)).toBe(false);
  });
});

describe("timedEventEndMs (presence footprint)", () => {
  const tz = "Europe/London";

  it("uses the event's own end when there is no stay override", () => {
    const start = wallToUtcMs(20260607, 9 * 60, tz);
    const end = wallToUtcMs(20260607, 10 * 60, tz);
    expect(timedEventEndMs(start, end, undefined)).toBe(end);
  });

  it("extends past the block end when stayMinutes is longer", () => {
    const start = wallToUtcMs(20260607, 9 * 60, tz); // Sun 09:00
    const end = wallToUtcMs(20260607, 10 * 60, tz); // 1h block
    // Two-day stay (2880 min) → footprint ends Tue 09:00, well past the block.
    expect(timedEventEndMs(start, end, 2880)).toBe(start + 2880 * 60_000);
  });

  it("keeps the block end when it is longer than the stay", () => {
    const start = wallToUtcMs(20260607, 9 * 60, tz);
    const end = wallToUtcMs(20260609, 9 * 60, tz); // 2-day block
    expect(timedEventEndMs(start, end, 60)).toBe(end);
  });

  it("lets a short prior-week event reach into this week via its stay", () => {
    // Sun 7 Jun 09:00, 1h block, but a 2-day stay. Window = Mon 8 .. Mon 15.
    const start = wallToUtcMs(20260607, 9 * 60, tz);
    const end = wallToUtcMs(20260607, 10 * 60, tz);
    const from = wallToUtcMs(20260608, 0, tz);
    const to = wallToUtcMs(20260615, 0, tz);
    // Block alone does NOT overlap the window...
    expect(timedOverlapsWindow(start, end, from, to)).toBe(false);
    // ...but the presence footprint does.
    const footprint = timedEventEndMs(start, end, 2880);
    expect(timedOverlapsWindow(start, footprint, from, to)).toBe(true);
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
