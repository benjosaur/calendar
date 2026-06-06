import type { Occurrence } from "./types";
import { eventDaySegment } from "./time";

/**
 * Bucket a flat list of occurrences into per-day timed / all-day groups.
 *
 * - timed: non-allDay events whose local [start, end] interval overlaps the day.
 *   A multi-day timed event lands in every day it touches so it can render a
 *   continuous band down each column (see `eventDaySegment`).
 * - allDay: all-day events whose inclusive [startDate, endDate] range contains the day.
 */
export function bucketByDay(
  occurrences: Occurrence[],
  dayCivils: number[],
  tz: string,
): { civil: number; timed: Occurrence[]; allDay: Occurrence[] }[] {
  return dayCivils.map((civil) => {
    const timed: Occurrence[] = [];
    const allDay: Occurrence[] = [];

    for (const occ of occurrences) {
      if (occ.allDay) {
        const startDate = occ.startDate ?? occ.endDate;
        const endDate = occ.endDate ?? occ.startDate;
        if (
          startDate !== undefined &&
          endDate !== undefined &&
          civil >= startDate &&
          civil <= endDate
        ) {
          allDay.push(occ);
        }
      } else if (
        occ.start !== undefined &&
        eventDaySegment(occ.start, occ.end ?? occ.start, civil, tz) !== null
      ) {
        timed.push(occ);
      }
    }

    return { civil, timed, allDay };
  });
}
