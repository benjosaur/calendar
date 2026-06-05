"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import type { LocationLite, Occurrence } from "@/lib/types";
import { useVisibleWeek } from "@/hooks/useVisibleWeek";
import { WeekGrid } from "@/components/WeekGrid";
import { ChatOverlay } from "@/components/ChatOverlay";
import { LocationLegend } from "@/components/LocationLegend";
import { EventDialog, type EventDialogState } from "@/components/EventDialog";

export default function CalendarPage() {
  const { signOut } = useAuthActions();
  const week = useVisibleWeek();
  const { tz, weekStartMs, weekEndMs } = week;

  const me = useQuery(api.users.currentUser);
  const locations = useQuery(api.locations.list) ?? [];
  const occurrences =
    useQuery(api.events.eventsForWeek, { weekStartMs, weekEndMs, tz }) ?? [];

  // Idempotent first-run setup (home location + timezone).
  const ensureSetup = useMutation(api.users.ensureSetup);
  useEffect(() => {
    void ensureSetup({});
  }, [ensureSetup]);

  // Map of location id -> LocationLite for fast colour/name resolution.
  const locationsById = useMemo(() => {
    const map: Record<string, LocationLite> = {};
    for (const loc of locations) map[loc._id] = loc;
    return map;
  }, [locations]);

  // Legend shows only places relevant to the visible week (plus Home, the baseline).
  const legendLocations = useMemo(() => {
    const used = new Set(
      occurrences.map((o) => o.locationId).filter(Boolean) as string[],
    );
    return locations.filter((l) => l.isHome || used.has(l._id));
  }, [locations, occurrences]);

  // EventDialog: closed | create at a slot | edit an existing occurrence.
  const [dialog, setDialog] = useState<EventDialogState>({ mode: "closed" });

  const onCreateAt = (civil: number, startMinutes?: number) =>
    setDialog({ mode: "create", civil, startMinutes });
  const onEdit = (occ: Occurrence) => setDialog({ mode: "edit", occurrence: occ });
  const closeDialog = () => setDialog({ mode: "closed" });

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
        <h1 className="hidden text-lg font-semibold text-neutral-900 sm:block">
          Calendar
        </h1>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={week.prev}
            aria-label="Previous week"
            className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={week.today}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={week.next}
            aria-label="Next week"
            className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
          >
            ›
          </button>
        </div>

        <span className="min-w-0 truncate text-xs font-medium text-neutral-700 sm:text-sm">
          {week.label}
        </span>

        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 sm:px-3 sm:text-sm"
        >
          Sign out
        </button>
      </header>

      {/* Body: the calendar fills the whole screen; the chat floats over it. */}
      <div className="relative min-h-0 flex-1">
        <main className="flex h-full min-w-0 flex-col">
          {/* Calendar grid (fills the height — the whole day fits on screen) */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <WeekGrid
              dayCivils={week.dayCivils}
              days={week.days}
              occurrences={occurrences}
              locationsById={locationsById}
              homeLocationId={me?.homeLocationId}
              tz={tz}
              onCreateAt={onCreateAt}
              onEdit={onEdit}
            />
          </div>

          {/* Location legend (hidden on small screens to save space) */}
          <div className="hidden border-t border-neutral-200 px-3 py-1.5 sm:block">
            <LocationLegend locations={legendLocations} />
          </div>
        </main>

        {/* Centred, translucent assistant overlay (expands on focus / while busy). */}
        <ChatOverlay tz={tz} onNavigate={week.goToMs} />
      </div>

      {/* Create / edit dialog */}
      <EventDialog
        state={dialog}
        tz={tz}
        locations={locations}
        onClose={closeDialog}
        onNavigate={week.goToMs}
      />
    </div>
  );
}
