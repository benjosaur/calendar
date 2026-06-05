"use client";

import { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useMutation } from "convex/react";
import { DateTime } from "luxon";
import { api } from "@convex/_generated/api";
import {
  minutesToPct,
  minutesOfDay,
  offsetToMinutes,
  snapMinutes,
  wallToUtcMs,
} from "@/lib/time";
import type { LocationLite, Occurrence } from "@/lib/types";

/** Minimum rendered height so very short events stay clickable. */
const MIN_HEIGHT_PX = 14;

function fmtTime(utcMs: number, tz: string): string {
  return DateTime.fromMillis(utcMs, { zone: tz }).toFormat("HH:mm");
}

/**
 * A single timed occurrence rendered inside a day column. Positioned absolutely
 * from its local start/end minutes. Draggable (via dnd-kit) to move it in time or
 * to another day; the top/bottom edges expose resize handles that call
 * resizeEvent (or editOccurrence for a recurring instance) directly with an
 * optimistic update. Dragging is the only way to edit a block — title, location,
 * and other fields are changed through the chat.
 */
export function EventBlock({
  occ,
  tz,
  locationsById,
}: {
  occ: Occurrence;
  tz: string;
  locationsById: Record<string, LocationLite>;
}) {
  const resizeEvent = useMutation(api.events.resizeEvent);
  const editOccurrence = useMutation(api.events.editOccurrence);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: occ.occurrenceId,
    data: { occ },
  });

  const start = occ.start ?? 0;
  const end = occ.end ?? start;
  const startMin = minutesOfDay(start, tz);
  const endMin = minutesOfDay(end, tz);
  // An event ending at local midnight reads as minute 0; treat it as end-of-day.
  const effectiveEndMin = endMin <= startMin ? 24 * 60 : endMin;

  const topPct = minutesToPct(startMin);
  const heightPct = Math.max(0, minutesToPct(effectiveEndMin) - topPct);

  const loc = occ.locationId ? locationsById[occ.locationId] : undefined;
  const borderColor = loc?.color ?? "#94a3b8";

  // Live drag offset (vertical only — moving between days is handled by the
  // DndContext's onDragEnd in WeekGrid).
  const dragOffset = transform ? transform.y : 0;

  /**
   * Pointer-driven resize for one edge. Computes the new snapped wall-clock time
   * from the absolute pointer Y relative to the grid column, then commits.
   */
  function beginResize(edge: "top" | "bottom", e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const column = (e.currentTarget as HTMLElement).closest("[data-time-grid]") as HTMLElement | null;
    if (!column) return;
    const rect = column.getBoundingClientRect();

    const apply = (clientY: number) => {
      const px = clientY - rect.top;
      const snapped = snapMinutes(offsetToMinutes(px, rect.height));
      if (edge === "top") {
        const newStartMs = wallToUtcMs(occ.occurrenceDate, Math.min(snapped, effectiveEndMin - 15), tz);
        commit({ newStart: newStartMs });
      } else {
        const newEndMs = wallToUtcMs(occ.occurrenceDate, Math.max(snapped, startMin + 15), tz);
        commit({ newEnd: newEndMs });
      }
    };

    const onMove = (ev: PointerEvent) => apply(ev.clientY);
    const onUp = (ev: PointerEvent) => {
      apply(ev.clientY);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function commit(patch: { newStart?: number; newEnd?: number }) {
    if (occ.isRecurring && occ.masterId) {
      // Recurring instance: persist as a per-occurrence override.
      void editOccurrence({
        masterId: occ.masterId,
        occurrenceDate: occ.occurrenceDate,
        override: {
          ...(patch.newStart !== undefined ? { start: patch.newStart } : {}),
          ...(patch.newEnd !== undefined ? { end: patch.newEnd } : {}),
        },
      });
    } else {
      void resizeEvent({ id: occ.eventId, ...patch });
    }
  }

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-1 z-20 overflow-hidden rounded-md bg-white/95 text-[11px] shadow-sm ring-1 ring-black/5"
      style={{
        top: `${topPct}%`,
        height: `${heightPct}%`,
        minHeight: MIN_HEIGHT_PX,
        borderLeft: `3px solid ${borderColor}`,
        transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
        opacity: isDragging ? 0.7 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      {/* Top resize handle */}
      <div
        className="absolute inset-x-0 top-0 z-30 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => beginResize("top", e)}
      />
      <div className="px-1.5 py-0.5">
        <div className="truncate font-medium text-neutral-800">{occ.title}</div>
        <div className="truncate text-[10px] text-neutral-500">
          {fmtTime(start, tz)}–{fmtTime(end, tz)}
        </div>
      </div>
      {/* Bottom resize handle */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 h-1.5 cursor-ns-resize"
        onPointerDown={(e) => beginResize("bottom", e)}
      />
    </div>
  );
}
