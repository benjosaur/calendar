"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { LocationLite } from "@/lib/types";

/** Swatch palette offered in the recolour picker (mirrors LOCATION_PALETTE plus
 *  the home indigo and travel amber so any band colour is reachable from the UI). */
const PALETTE = [
  "#0ea5e9", "#ec4899", "#22c55e", "#ef4444",
  "#a855f7", "#14b8a6", "#f43f5e", "#06b6d4",
  "#6366f1", "#f59e0b", "#eab308",
];

/**
 * Left-hand control of the bottom bar: a "Places" button opening an upward
 * popover that lists the user's colour-coded places with full inline editing —
 * recolour, rename, set home, add and delete. The same actions are available
 * through the agent chat.
 */
export function PlacesControl() {
  const locations = (useQuery(api.locations.list) ?? []) as LocationLite[];
  const upsert = useMutation(api.locations.upsert);
  const update = useMutation(api.locations.update);
  const remove = useMutation(api.locations.remove);
  const setHome = useMutation(api.locations.setHome);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [addName, setAddName] = useState("");

  // Collapse when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPaletteFor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function addPlace() {
    const name = addName.trim();
    if (!name) return;
    await upsert({ name });
    setAddName("");
  }

  async function rename(loc: LocationLite, value: string) {
    const name = value.trim();
    if (!name || name === loc.name) return;
    await update({ locationId: loc._id, name });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm font-medium text-neutral-700 shadow-2xl ring-1 ring-black/5 backdrop-blur-md hover:bg-white/90"
      >
        <span aria-hidden className="text-base leading-none">📍</span>
        <span>Places</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl ring-1 ring-black/5 backdrop-blur-md">
          <ul className="max-h-[55vh] overflow-y-auto p-1.5">
            {locations.map((loc) => (
              <li key={loc._id} className="rounded-lg px-1.5 py-1 hover:bg-black/[0.04]">
                <div className="flex items-center gap-2">
                  {/* Swatch — click to open the recolour palette. */}
                  <button
                    type="button"
                    aria-label={`Recolour ${loc.name}`}
                    onClick={() =>
                      setPaletteFor((id) => (id === loc._id ? null : loc._id))
                    }
                    className="h-4 w-4 shrink-0 rounded-sm ring-1 ring-black/10"
                    style={{ backgroundColor: loc.color }}
                  />

                  {/* Name — rename on Enter / blur. */}
                  <input
                    defaultValue={loc.name}
                    aria-label={`Rename ${loc.name}`}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-neutral-800 outline-none hover:border-neutral-200 focus:border-indigo-400 focus:bg-white"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => void rename(loc, e.target.value)}
                  />

                  {loc.isHome ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">
                      home
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="Set as home"
                        onClick={() => void setHome({ locationId: loc._id })}
                        className="shrink-0 rounded px-1 text-sm text-neutral-400 hover:bg-black/5 hover:text-neutral-700"
                      >
                        ⌂
                      </button>
                      <button
                        type="button"
                        title={`Delete ${loc.name}`}
                        onClick={() => void remove({ locationId: loc._id })}
                        className="shrink-0 rounded px-1 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>

                {/* Recolour palette for this place. */}
                {paletteFor === loc._id && (
                  <div className="flex flex-wrap gap-1.5 px-1 pb-1 pt-1.5">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Use ${c}`}
                        onClick={() => {
                          void update({ locationId: loc._id, color: c });
                          setPaletteFor(null);
                        }}
                        className="h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Add a place. */}
          <div className="flex items-center gap-1.5 border-t border-black/5 p-2">
            <input
              value={addName}
              placeholder="Add a place…"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addPlace();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void addPlace()}
              disabled={addName.trim().length === 0}
              className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {/* Static "Travelling" key for the 30-min travel buffers. */}
          <div className="flex items-center gap-1.5 border-t border-black/5 px-3 py-1.5 text-xs text-neutral-500">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/10"
              style={{ backgroundColor: "#f59e0b" }}
            />
            <span>Travelling</span>
          </div>
        </div>
      )}
    </div>
  );
}
