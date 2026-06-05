import type { Occurrence } from "./types";
import { civilForInstant } from "./time";

/**
 * Bucket a flat list of occurrences into per-day timed / all-day groups.
 *
 * - timed: non-allDay events whose local start civil date (in `tz`) equals the day.
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
      } else if (occ.start !== undefined && civilForInstant(occ.start, tz) === civil) {
        timed.push(occ);
      }
    }

    return { civil, timed, allDay };
  });
}
