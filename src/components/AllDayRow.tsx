"use client";

import type { LocationLite, Occurrence } from "@/lib/types";

/**
 * Stacked all-day chips shown above a day's time grid. Each chip is coloured by
 * its location (if any) and opens the editor on click.
 */
export function AllDayRow({
  occurrences,
  locationsById,
  onEdit,
}: {
  occurrences: Occurrence[];
  locationsById: Record<string, LocationLite>;
  onEdit: (occ: Occurrence) => void;
}) {
  return (
    <div className="flex min-h-[24px] flex-col gap-0.5 px-1 py-0.5">
      {occurrences.map((occ) => {
        const loc = occ.locationId ? locationsById[occ.locationId] : undefined;
        const color = loc?.color ?? "#94a3b8";
        return (
          <button
            key={occ.occurrenceId}
            type="button"
            onClick={() => onEdit(occ)}
            className="truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-neutral-800 hover:brightness-95"
            style={{ backgroundColor: `${color}33` }}
            title={occ.title}
          >
            {occ.title}
          </button>
        );
      })}
    </div>
  );
}
