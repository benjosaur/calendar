"use client";

import { DAY_START_MIN, DAY_END_MIN, minutesToPct } from "@/lib/time";

/** Whole hours within the visible window, e.g. 7,8,…,24. */
const HOURS = Array.from(
  { length: DAY_END_MIN / 60 - DAY_START_MIN / 60 + 1 },
  (_, i) => DAY_START_MIN / 60 + i,
);

/**
 * Shared hour gridlines for a day column. Lives at z-10, above the presence
 * background and below the event blocks. Pointer-events are disabled so they
 * never interfere with dragging an event block. Positions are percentages so
 * the lines stay aligned no matter the (responsive) column height.
 */
export function HourLines() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-neutral-200/70"
          style={{ top: `${minutesToPct(h * 60)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Left rail of hour labels (the y-axis), aligned to the same vertical scale as
 * the day columns. Fills its container's height; labels are positioned by
 * percentage so they line up with HourLines.
 */
export function HourGutter() {
  return (
    <div className="relative h-full w-12 shrink-0 select-none text-right text-[10px] text-neutral-400">
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute right-1 -translate-y-1/2"
          style={{ top: `${minutesToPct(h * 60)}%` }}
        >
          {h === 24 ? "00" : String(h).padStart(2, "0")}
        </div>
      ))}
    </div>
  );
}
