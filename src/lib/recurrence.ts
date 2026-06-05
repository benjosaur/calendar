import { DateTime } from "luxon";
import type { Id, Recurrence } from "./types";
import { fromCivilParts, minutesOfDay, toCivil, wallToUtcMs } from "./time";

/**
 * Master event shape needed to expand a recurrence. Mirrors the relevant subset
 * of the `events` table; kept independent of `convex/_generated` so the libs can
 * be unit-tested offline.
 */
export interface MasterLike {
  _id: Id<"events">;
  title: string;
  description?: string;
  allDay: boolean;
  start?: number;
  end?: number;
  timezone: string;
  startDate?: number;
  endDate?: number;
  locationId?: Id<"locations">;
  recurrence?: Recurrence;
}

/** A single expanded instance with the concrete instant/civil fields for its date. */
export interface ExpandedInstance {
  occurrenceDate: number;
  start?: number;
  end?: number;
  startDate?: number;
  endDate?: number;
}

/** Step a Luxon DateTime forward by one recurrence interval. */
function advance(dt: DateTime, freq: Recurrence["freq"], interval: number): DateTime {
  switch (freq) {
    case "daily":
      return dt.plus({ days: interval });
    case "weekly":
      return dt.plus({ weeks: interval });
    case "monthly":
      return dt.plus({ months: interval });
    case "yearly":
      return dt.plus({ years: interval });
  }
}

/** Build the concrete instance for a given civil anchor date. */
function instanceForDate(master: MasterLike, civil: number): ExpandedInstance {
  if (master.allDay) {
    // Shift the all-day [startDate,endDate] range so it begins on `civil`,
    // preserving the original span in days.
    const baseStart = master.startDate ?? civil;
    const baseEnd = master.endDate ?? baseStart;
    const tz = master.timezone;
    const spanDays = Math.round(
      DateTime.fromObject(fromCivilNamed(baseEnd), { zone: tz })
        .diff(DateTime.fromObject(fromCivilNamed(baseStart), { zone: tz }), "days")
        .days,
    );
    const newStart = civil;
    const newEnd = toCivil(
      DateTime.fromObject(fromCivilNamed(civil), { zone: tz }).plus({ days: spanDays }),
    );
    return { occurrenceDate: civil, startDate: newStart, endDate: newEnd };
  }

  // Timeblocked: apply the master's wall-clock time on `civil` in its tz,
  // converting to UTC (DST-correct: 09:00 stays local 09:00).
  const tz = master.timezone;
  const startMin = master.start !== undefined ? minutesOfDay(master.start, tz) : 0;
  const durationMs =
    master.start !== undefined && master.end !== undefined ? master.end - master.start : 0;
  const start = wallToUtcMs(civil, startMin, tz);
  const end = start + durationMs;
  return { occurrenceDate: civil, start, end };
}

/** Convert civil int to a Luxon object literal {year,month,day}. */
function fromCivilNamed(civil: number): { year: number; month: number; day: number } {
  const { y, m, d } = fromCivilParts(civil);
  return { year: y, month: m, day: d };
}

/**
 * Expand a master event into concrete instances whose occurrence date falls
 * within [windowStartCivil, windowEndCivil] (inclusive).
 *
 * The non-recurring master counts as occurrence #1 at its own date. For weekly
 * rules with byWeekday (0=Mon..6=Sun) every matching weekday in each interval
 * week is emitted. `until` (civil, inclusive) and `count` cap generation.
 */
export function expandMaster(
  master: MasterLike,
  windowStartCivil: number,
  windowEndCivil: number,
): ExpandedInstance[] {
  const tz = master.timezone;
  const anchorCivil =
    master.allDay
      ? master.startDate ?? windowStartCivil
      : master.start !== undefined
        ? toCivil(DateTime.fromMillis(master.start, { zone: tz }))
        : windowStartCivil;

  // Non-recurring: just the master itself, if it lands in the window.
  if (!master.recurrence) {
    if (anchorCivil >= windowStartCivil && anchorCivil <= windowEndCivil) {
      return [instanceForDate(master, anchorCivil)];
    }
    return [];
  }

  const rule = master.recurrence;
  const interval = Math.max(1, rule.interval);
  const out: ExpandedInstance[] = [];
  let emitted = 0; // counts toward rule.count

  // Hard upper bound to guarantee termination for unbounded rules.
  const MAX_ITER = 100000;

  const anchor = DateTime.fromObject(fromCivilNamed(anchorCivil), { zone: tz });

  // For weekly+byWeekday we iterate week-by-week and emit matching weekdays;
  // otherwise we step the anchor by the interval directly.
  const weeklyDays =
    rule.freq === "weekly" && rule.byWeekday && rule.byWeekday.length > 0
      ? [...rule.byWeekday].sort((a, b) => a - b)
      : null;

  let cursor = weeklyDays ? anchor.startOf("week") : anchor; // Luxon week starts Monday
  let iter = 0;

  outer: while (iter++ < MAX_ITER) {
    const dates: number[] = [];
    if (weeklyDays) {
      for (const wd of weeklyDays) {
        // Luxon weekday: 1=Mon..7=Sun; our wd: 0=Mon..6=Sun.
        const day = cursor.set({ weekday: (wd + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        dates.push(toCivil(day));
      }
    } else {
      dates.push(toCivil(cursor));
    }

    for (const civil of dates) {
      // Skip dates strictly before the anchor (first week may have earlier weekdays).
      if (civil < anchorCivil) continue;
      if (rule.until !== undefined && civil > rule.until) break outer;
      if (rule.count !== undefined && emitted >= rule.count) break outer;

      emitted++;
      if (civil >= windowStartCivil && civil <= windowEndCivil) {
        out.push(instanceForDate(master, civil));
      }
      // Once past the window end, no later date can re-enter it.
      if (civil > windowEndCivil) {
        // Continue scanning only if count/until might still constrain; but since
        // dates only increase, we can stop entirely.
        break outer;
      }
    }

    cursor = weeklyDays
      ? cursor.plus({ weeks: interval })
      : advance(cursor, rule.freq, interval);
  }

  return out;
}
