"use client";

import { minutesToPct, minutesOfDay } from "@/lib/time";
import type { PresenceBand } from "@/lib/types";

/**
 * Renders the "where you are" presence layer behind a day's events. Each band is
 * an absolutely positioned, low-opacity coloured strip spanning its time range.
 * Sits at z-0 and ignores pointer events so the grid stays interactive.
 */
export function PresenceBackground({
  bands,
  tz,
}: {
  bands: PresenceBand[];
  tz: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {bands.map((band, i) => {
        const top = minutesToPct(minutesOfDay(band.from, tz));
        // `to` at local midnight resolves to minute 0; treat the final band as
        // running to the bottom of the grid (24:00) rather than back to the top.
        const bottomMin = minutesOfDay(band.to, tz);
        const bottom =
          bottomMin === 0 && band.to > band.from
            ? minutesToPct(24 * 60)
            : minutesToPct(bottomMin);
        const height = Math.max(0, bottom - top);

        // Home recedes; away-locations and travel are bold so they clearly stand out.
        const opacity =
          band.kind === "home" ? 0.08 : band.kind === "travel" ? 0.3 : 0.42;
        // Label away/travel bands (when tall enough) so presence is unmistakable.
        const showLabel = band.kind !== "home" && height >= 4;

        return (
          <div
            key={`${band.from}-${i}`}
            className="absolute inset-x-0 flex justify-center overflow-hidden"
            style={{ top: `${top}%`, height: `${height}%` }}
            title={band.name}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: band.color, opacity }}
            />
            {showLabel && (
              <span
                className="relative mt-1 max-w-full truncate px-1 text-[9px] font-semibold uppercase tracking-wide"
                style={{ color: band.kind === "travel" ? "#92400e" : band.color }}
              >
                {band.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
