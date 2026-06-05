"use client";

import type { LocationLite, Occurrence } from "@/lib/types";

/**
 * Stacked all-day chips shown above a day's time grid. Each chip is coloured by
 * its location (if any). All-day events are created and edited through the chat,
 * so the chips are display-only labels.
 */
export function AllDayRow({
  occurrences,
  locationsById,
}: {
  occurrences: Occurrence[];
  locationsById: Record<string, LocationLite>;
}) {
  return (
    <div className="flex min-h-[24px] flex-col gap-0.5 px-1 py-0.5">
      {occurrences.map((occ) => {
        const loc = occ.locationId ? locationsById[occ.locationId] : undefined;
        const color = loc?.color ?? "#94a3b8";
        return (
          <div
            key={occ.occurrenceId}
            className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-neutral-800"
            style={{ backgroundColor: `${color}33` }}
            title={occ.title}
          >
            {occ.title}
          </div>
        );
      })}
    </div>
  );
}
