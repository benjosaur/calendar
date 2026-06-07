"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import type { LocationLite } from "@/lib/types";
import { useVisibleWeek } from "@/hooks/useVisibleWeek";
import { useTheme } from "@/hooks/useTheme";
import { WeekGrid } from "@/components/WeekGrid";
import { BottomBar } from "@/components/BottomBar";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function CalendarPage() {
  const { signOut } = useAuthActions();
  const { theme, toggle } = useTheme();
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

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 sm:px-3 sm:text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Body: the calendar fills the whole screen; the chat floats over it. */}
      <div className="relative min-h-0 flex-1">
        <main className="flex h-full min-w-0 flex-col">
          {/* Calendar grid fills the whole body; the bottom bar floats over it. */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <WeekGrid
              dayCivils={week.dayCivils}
              days={week.days}
              occurrences={occurrences}
              locationsById={locationsById}
              homeLocationId={me?.homeLocationId}
              tz={tz}
            />
          </div>
        </main>

        {/* Inline bottom bar: Places · Chat · Context (floats over the calendar). */}
        <BottomBar tz={tz} onNavigate={week.goToMs} />
      </div>
    </div>
  );
}
