"use client";

import { offsetToMinutes, snapMinutes } from "@/lib/time";
import type { LocationLite, Occurrence, PresenceBand } from "@/lib/types";
import { EventBlock } from "./EventBlock";
import { HourLines } from "./TimeGrid";
import { PresenceBackground } from "./PresenceBackground";

/**
 * A single day's time-grid surface (the day header and all-day row are rendered
 * by WeekGrid so they align with the hour gutter). Fills the available height;
 * layers bottom-to-top: presence background, hour lines, a transparent
 * click-to-create surface, and the timed event blocks. Presence bands are
 * computed by WeekGrid (which sees the whole week, for multi-day stays).
 */
export function DayColumn({
  civil,
  timed,
  bands,
  locationsById,
  tz,
  onCreateAt,
  onEdit,
}: {
  civil: number;
  timed: Occurrence[];
  bands: PresenceBand[];
  locationsById: Record<string, LocationLite>;
  tz: string;
  onCreateAt: (civil: number, startMin: number) => void;
  onEdit: (occ: Occurrence) => void;
}) {
  return (
    <div data-time-grid data-civil={civil} className="relative h-full border-l border-neutral-200">
      <PresenceBackground bands={bands} tz={tz} />
      <HourLines />

      {/* Click-to-create surface (z-10, below event blocks at z-20). */}
      <div
        className="absolute inset-0 z-10"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const startMin = snapMinutes(offsetToMinutes(e.clientY - rect.top, rect.height));
          onCreateAt(civil, startMin);
        }}
      />

      {timed.map((occ) => (
        <EventBlock
          key={occ.occurrenceId}
          occ={occ}
          tz={tz}
          locationsById={locationsById}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
