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
import {
  civilForInstant,
  offsetToMinutes,
  snapMinutes,
  wallToUtcMs,
} from "@/lib/time";
import { useNow } from "@/hooks/useNow";
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
}: {
  dayCivils: number[];
  days: DateTime[];
  occurrences: Occurrence[];
  locationsById: Record<string, LocationLite>;
  homeLocationId?: Id<"locations">;
  tz: string;
}) {
  const moveEvent = useMutation(api.events.moveEvent);
  const editOccurrence = useMutation(api.events.editOccurrence);

  // Live current instant (ticks each minute) drives the "now" line and the
  // today-highlight in the header, so both stay current without a reload.
  const nowMs = useNow();
  const todayCivil = civilForInstant(nowMs, tz);

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
          <div className="w-7 shrink-0 sm:w-12" />
          {buckets.map((b, i) => {
            const isToday = b.civil === todayCivil;
            return (
              <div
                key={b.civil}
                className={`min-w-0 flex-1 border-l border-neutral-200 px-2 py-1 text-center text-[11px] font-semibold ${
                  isToday ? "text-red-600" : "text-neutral-600"
                }`}
              >
                <span className="uppercase">{days[i].toFormat("ccc")}</span>{" "}
                <span
                  className={
                    isToday
                      ? "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 align-middle text-[10px] font-bold text-white"
                      : undefined
                  }
                >
                  {days[i].day}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-day band */}
        <div className="flex shrink-0 border-b border-neutral-200">
          <div className="w-7 shrink-0 px-1 py-1 text-right text-[9px] uppercase tracking-wide text-neutral-300 sm:w-12">
            <span className="hidden sm:inline">all-day</span>
          </div>
          {buckets.map((b) => (
            <div key={b.civil} className="min-w-0 flex-1 border-l border-neutral-200">
              <AllDayRow
                occurrences={b.allDay}
                locationsById={locationsById}
              />
            </div>
          ))}
        </div>

        {/* Time grid band (fills remaining height) */}
        <div className="flex min-h-0 flex-1">
          <HourGutter />
          {buckets.map((b, idx) => {
            const dayStartMs = wallToUtcMs(b.civil, 0, tz);
            const dayEndMs = wallToUtcMs(b.civil, 24 * 60, tz);
            // Luxon weekday: 1=Monday .. 7=Sunday; weekdays 1–5 get the default
            // Westminster rule (9:00–18:00) as a background presence layer.
            const isWeekday = days[idx].weekday >= 1 && days[idx].weekday <= 5;
            const defaultIntervals = isWeekday
              ? [
                  {
                    from: wallToUtcMs(b.civil, 9 * 60, tz),
                    to: wallToUtcMs(b.civil, 18 * 60, tz),
                    name: "Westminster",
                    color: "#a855f7",
                  },
                ]
              : undefined;
            const bands = derivePresenceBands({
              locationEvents,
              dayStartMs,
              dayEndMs,
              homeLocationId,
              locationsById,
              defaultIntervals,
            });
            return (
              <div key={b.civil} className="min-w-0 flex-1">
                <DayColumn
                  civil={b.civil}
                  timed={b.timed}
                  bands={bands}
                  locationsById={locationsById}
                  tz={tz}
                  nowMs={nowMs}
                />
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
