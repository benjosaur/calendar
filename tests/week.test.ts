import { describe, it, expect } from "vitest";
import { bucketByDay } from "../src/lib/week";
import type { Id, Occurrence } from "../src/lib/types";
import { wallToUtcMs, weekBounds } from "../src/lib/time";

const eid = (s: string) => s as Id<"events">;
const TZ = "Europe/London";

function timed(civil: number, startMin: number): Occurrence {
  const start = wallToUtcMs(civil, startMin, TZ);
  return {
    occurrenceId: `t:${civil}:${startMin}`,
    eventId: eid("e"),
    occurrenceDate: civil,
    title: "timed",
    allDay: false,
    start,
    end: start + 3600_000,
    timezone: TZ,
    isRecurring: false,
  };
}

function allDay(startDate: number, endDate: number): Occurrence {
  return {
    occurrenceId: `a:${startDate}:${endDate}`,
    eventId: eid("e"),
    occurrenceDate: startDate,
    title: "allday",
    allDay: true,
    startDate,
    endDate,
    timezone: TZ,
    isRecurring: false,
  };
}

describe("bucketByDay", () => {
  const wb = weekBounds(TZ, wallToUtcMs(20260603, 12 * 60, TZ)); // week of Mon 2026-06-01

  it("splits timed vs all-day across the week", () => {
    const occs: Occurrence[] = [
      timed(20260601, 9 * 60), // Monday timed
      timed(20260603, 14 * 60), // Wednesday timed
      allDay(20260602, 20260604), // Tue-Thu spanning all-day
    ];
    const buckets = bucketByDay(occs, wb.dayCivils, TZ);
    expect(buckets).toHaveLength(7);

    const byCivil = Object.fromEntries(buckets.map((b) => [b.civil, b]));
    // Monday: 1 timed, 0 all-day.
    expect(byCivil[20260601].timed).toHaveLength(1);
    expect(byCivil[20260601].allDay).toHaveLength(0);
    // Wednesday: 1 timed + the all-day span covers it.
    expect(byCivil[20260603].timed).toHaveLength(1);
    expect(byCivil[20260603].allDay).toHaveLength(1);
    // Tuesday and Thursday: covered by all-day only.
    expect(byCivil[20260602].allDay).toHaveLength(1);
    expect(byCivil[20260604].allDay).toHaveLength(1);
    expect(byCivil[20260602].timed).toHaveLength(0);
    // Friday: nothing.
    expect(byCivil[20260605].timed).toHaveLength(0);
    expect(byCivil[20260605].allDay).toHaveLength(0);
  });

  it("places a timed event on the day of its LOCAL start civil", () => {
    // 23:30 local on Monday stays on Monday.
    const occ = timed(20260601, 23 * 60 + 30);
    const buckets = bucketByDay([occ], wb.dayCivils, TZ);
    const mon = buckets.find((b) => b.civil === 20260601)!;
    expect(mon.timed).toHaveLength(1);
  });
});
