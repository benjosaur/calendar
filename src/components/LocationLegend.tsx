"use client";

import type { LocationLite } from "@/lib/types";

/** Horizontal legend of location colour swatches and names. */
export function LocationLegend({ locations }: { locations: LocationLite[] }) {
  if (locations.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-600">
      {locations.map((loc) => (
        <li key={loc._id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
            style={{ backgroundColor: loc.color }}
          />
          <span>{loc.name}</span>
          {loc.isHome && (
            <span className="text-[10px] uppercase tracking-wide text-neutral-400">
              home
            </span>
          )}
        </li>
      ))}
      {/* Static "Travelling" key for the 30-min travel buffers. */}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
          style={{ backgroundColor: "#f59e0b" }}
        />
        <span>Travelling</span>
      </li>
    </ul>
  );
}
