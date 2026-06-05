"use client";

import { useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation } from "convex/react";
import { DateTime } from "luxon";
import { api } from "@convex/_generated/api";
import { bucketByDay } from "@/lib/week";
import { derivePresenceBands } from "@/lib/presence";
import { offsetToMinutes, snapMinutes, wallToUtcMs } from "@/lib/time";
import type { Id, LocationLite, Occurrence } from "@/lib/types";
import { DayColumn } from "./DayColumn";
import { AllDayRow } from "./AllDayRow";
import { HourGutter } from "./TimeGrid";

/**
 * The week view: all seven days (Mon–Sun) in a single row, weekend beside the
 * weekdays, with time on the y-axis (an hour gutter on the left). Three stacked
 * bands — day headers, all-day chips, and the time grid — share a left gutter so
 * everything stays aligned; the time grid fills the remaining height so the whole
 * 07:00–24:00 window fits the screen. A single DndContext wraps the grid so an
 * event can be dragged to any day; onDragEnd derives the dropped event's new
 * start and commits via moveEvent (one-offs) or editOccurrence (recurring).
 */
export function WeekGrid({
  dayCivils,
  days,
  occurrences,
  locationsById,
  homeLocationId,
  tz,
  onCreateAt,
  onEdit,
}: {
  dayCivils: number[];
  days: DateTime[];
  occurrences: Occurrence[];
  locationsById: Record<string, LocationLite>;
  homeLocationId?: Id<"locations">;
  tz: string;
  onCreateAt: (civil: number, startMin: number) => void;
  onEdit: (occ: Occurrence) => void;
}) {
  const moveEvent = useMutation(api.events.moveEvent);
  const editOccurrence = useMutation(api.events.editOccurrence);

  // A small activation distance so clicks (open editor) aren't swallowed by drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const buckets = bucketByDay(occurrences, dayCivils, tz);
  const byOccId = new Map(occurrences.map((o) => [o.occurrenceId, o]));

  // Presence is derived from ALL the week's location-tagged timed events (not just
  // a single day's), so multi-day stays fill intermediate columns correctly.
  const locationEvents = occurrences.filter(
    (o) => !o.allDay && o.start !== undefined && o.locationId,
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const occ = (event.active.data.current?.occ as Occurrence | undefined)
        ?? byOccId.get(String(event.active.id));
      if (!occ || occ.allDay || occ.start === undefined) return;

      // Drop point in viewport coords (activator + accumulated delta).
      const activator = event.activatorEvent as PointerEvent | MouseEvent;
      const dropX = activator.clientX + event.delta.x;
      const dropY = activator.clientY + event.delta.y;

      // Hit-test which day column we landed over.
      const stack =
        typeof document !== "undefined"
          ? document.elementsFromPoint(dropX, dropY)
          : [];
      const gridEl = stack.find((el) =>
        (el as HTMLElement).hasAttribute?.("data-time-grid"),
      ) as HTMLElement | undefined;
      if (!gridEl?.dataset.civil) return; // dropped outside a day column → no-op

      const targetCivil = Number(gridEl.dataset.civil);
      const rect = gridEl.getBoundingClientRect();
      const newStartMin = snapMinutes(offsetToMinutes(dropY - rect.top, rect.height));
      const newStart = wallToUtcMs(targetCivil, newStartMin, tz);
      if (newStart === occ.start) return; // no-op

      if (occ.isRecurring && occ.masterId) {
        // Preserve duration by shifting end alongside start.
        const duration = (occ.end ?? occ.start) - occ.start;
        void editOccurrence({
          masterId: occ.masterId,
          occurrenceDate: occ.occurrenceDate,
          override: { start: newStart, end: newStart + duration },
        });
      } else {
        // moveEvent keeps the original duration when newEnd is omitted.
        void moveEvent({ id: occ.eventId, newStart });
      }
    },
    [byOccId, tz, moveEvent, editOccurrence],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col">
        {/* Day header band */}
        <div className="flex shrink-0 border-b border-neutral-200">
          <div className="w-12 shrink-0" />
          {buckets.map((b, i) => (
            <div
              key={b.civil}
              className="min-w-0 flex-1 border-l border-neutral-200 px-2 py-1 text-center text-[11px] font-semibold text-neutral-600"
            >
              {days[i].toFormat("ccc d")}
            </div>
          ))}
        </div>

        {/* All-day band */}
        <div className="flex shrink-0 border-b border-neutral-200">
          <div className="w-12 shrink-0 px-1 py-1 text-right text-[9px] uppercase tracking-wide text-neutral-300">
            all-day
          </div>
          {buckets.map((b) => (
            <div key={b.civil} className="min-w-0 flex-1 border-l border-neutral-200">
              <AllDayRow
                occurrences={b.allDay}
                locationsById={locationsById}
                onEdit={onEdit}
              />
            </div>
          ))}
        </div>

        {/* Time grid band (fills remaining height) */}
        <div className="flex min-h-0 flex-1">
          <HourGutter />
          {buckets.map((b) => {
            const dayStartMs = wallToUtcMs(b.civil, 0, tz);
            const dayEndMs = wallToUtcMs(b.civil, 24 * 60, tz);
            const bands = derivePresenceBands({
              locationEvents,
              dayStartMs,
              dayEndMs,
              homeLocationId,
              locationsById,
            });
            return (
              <div key={b.civil} className="min-w-0 flex-1">
                <DayColumn
                  civil={b.civil}
                  timed={b.timed}
                  bands={bands}
                  locationsById={locationsById}
                  tz={tz}
                  onCreateAt={onCreateAt}
                  onEdit={onEdit}
                />
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
