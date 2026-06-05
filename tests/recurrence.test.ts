import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { expandMaster, type MasterLike } from "../src/lib/recurrence";
import type { Id } from "../src/lib/types";
import { minutesOfDay, wallToUtcMs } from "../src/lib/time";

const eid = (s: string) => s as Id<"events">;

// Helper to build a timeblocked master starting at a given civil + wall-clock.
function timedMaster(
  civil: number,
  startMin: number,
  durationMin: number,
  tz: string,
  recurrence?: MasterLike["recurrence"],
): MasterLike {
  const start = wallToUtcMs(civil, startMin, tz);
  return {
    _id: eid("m1"),
    title: "Event",
    allDay: false,
    start,
    end: start + durationMin * 60_000,
    timezone: tz,
    recurrence,
  };
}

describe("expandMaster", () => {
  it("non-recurring master returns itself once (in window)", () => {
    const m = timedMaster(20260603, 9 * 60, 60, "Europe/London");
    const inst = expandMaster(m, 20260601, 20260607);
    expect(inst).toHaveLength(1);
    expect(inst[0].occurrenceDate).toBe(20260603);
    const empty = expandMaster(m, 20260608, 20260614);
    expect(empty).toHaveLength(0);
  });

  it("weekly byWeekday expansion within a window", () => {
    // 2026-06-01 is a Monday. Recur weekly on Mon(0), Wed(2), Fri(4).
    const m = timedMaster(20260601, 9 * 60, 60, "Europe/London", {
      freq: "weekly",
      interval: 1,
      byWeekday: [0, 2, 4],
    });
    const inst = expandMaster(m, 20260601, 20260607);
    expect(inst.map((i) => i.occurrenceDate)).toEqual([20260601, 20260603, 20260605]);
  });

  it("respects interval > 1 (every 2 weeks)", () => {
    // Weekly on Monday, every 2 weeks starting 2026-06-01.
    const m = timedMaster(20260601, 9 * 60, 60, "Europe/London", {
      freq: "weekly",
      interval: 2,
      byWeekday: [0],
    });
    const inst = expandMaster(m, 20260601, 20260630);
    // Mondays: Jun 1, 15, 29 (skipping 8, 22).
    expect(inst.map((i) => i.occurrenceDate)).toEqual([20260601, 20260615, 20260629]);
  });

  it("caps via count", () => {
    const m = timedMaster(20260601, 9 * 60, 60, "Europe/London", {
      freq: "daily",
      interval: 1,
      count: 3,
    });
    const inst = expandMaster(m, 20260601, 20260630);
    expect(inst.map((i) => i.occurrenceDate)).toEqual([20260601, 20260602, 20260603]);
  });

  it("caps via until (inclusive)", () => {
    const m = timedMaster(20260601, 9 * 60, 60, "Europe/London", {
      freq: "daily",
      interval: 1,
      until: 20260603,
    });
    const inst = expandMaster(m, 20260601, 20260630);
    expect(inst.map((i) => i.occurrenceDate)).toEqual([20260601, 20260602, 20260603]);
  });

  it("DST week keeps wall-clock 09:00 local across a DST change", () => {
    // UK clocks go back on 2026-10-25 (BST -> GMT). A 09:00 weekly Sunday event
    // must remain local 09:00 on both sides of the change.
    const tz = "Europe/London";
    // 2026-10-18 is a Sunday (BST). Weekly on Sunday(6).
    const m = timedMaster(20261018, 9 * 60, 60, tz, {
      freq: "weekly",
      interval: 1,
      byWeekday: [6],
    });
    const inst = expandMaster(m, 20261018, 20261101);
    const dates = inst.map((i) => i.occurrenceDate);
    expect(dates).toContain(20261018); // before DST change (BST)
    expect(dates).toContain(20261025); // the DST-change Sunday
    expect(dates).toContain(20261101); // after change (GMT)
    for (const i of inst) {
      expect(minutesOfDay(i.start!, tz)).toBe(9 * 60);
    }
    // Sanity: the two instants are NOT exactly 7*24h apart due to the extra hour.
    const oct18 = inst.find((i) => i.occurrenceDate === 20261018)!.start!;
    const oct25 = inst.find((i) => i.occurrenceDate === 20261025)!.start!;
    expect(oct25 - oct18).toBe((7 * 24 + 1) * 3600_000); // gained an hour
  });

  it("expands all-day masters by shifting the date range", () => {
    const m: MasterLike = {
      _id: eid("m2"),
      title: "Trip",
      allDay: true,
      startDate: 20260601,
      endDate: 20260602, // 2-day span
      timezone: "Europe/London",
      recurrence: { freq: "weekly", interval: 1, byWeekday: [0] },
    };
    const inst = expandMaster(m, 20260601, 20260620);
    expect(inst.map((i) => [i.startDate, i.endDate])).toEqual([
      [20260601, 20260602],
      [20260608, 20260609],
      [20260615, 20260616],
    ]);
  });
});

describe("sanity: 2026-06-01 is a Monday", () => {
  it("weekday check", () => {
    expect(DateTime.fromObject({ year: 2026, month: 6, day: 1 }).weekday).toBe(1);
  });
});
