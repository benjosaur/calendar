"use client";

import { civilForInstant } from "@/lib/time";
import type { LocationLite, Occurrence, PresenceBand } from "@/lib/types";
import { EventBlock } from "./EventBlock";
import { HourLines, NowIndicator } from "./TimeGrid";
import { PresenceBackground } from "./PresenceBackground";

/**
 * A single day's time-grid surface (the day header and all-day row are rendered
 * by WeekGrid so they align with the hour gutter). Fills the available height;
 * layers bottom-to-top: presence background, hour lines, and the timed event
 * blocks. Events are created via chat and edited by dragging/resizing the blocks
 * — there is no click-to-create. Presence bands are computed by WeekGrid (which
 * sees the whole week, for multi-day stays).
 */
export function DayColumn({
  civil,
  timed,
  bands,
  locationsById,
  tz,
  nowMs,
}: {
  civil: number;
  timed: Occurrence[];
  bands: PresenceBand[];
  locationsById: Record<string, LocationLite>;
  tz: string;
  /** Live current instant; the "now" line shows only when this lands on `civil`. */
  nowMs: number;
}) {
  const isToday = civilForInstant(nowMs, tz) === civil;
  return (
    <div data-time-grid data-civil={civil} className="relative h-full border-l border-neutral-200">
      <PresenceBackground bands={bands} tz={tz} />
      <HourLines />

      {timed.map((occ) => (
        <EventBlock
          key={occ.occurrenceId}
          occ={occ}
          civil={civil}
          tz={tz}
          locationsById={locationsById}
        />
      ))}

      {isToday && <NowIndicator nowMs={nowMs} tz={tz} />}
    </div>
  );
}
