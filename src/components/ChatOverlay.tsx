"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CommandFeed } from "./CommandFeed";
import { CommandInput } from "./CommandInput";

/**
 * The assistant as a centred, translucent "ghost" bar floating over the calendar.
 * Collapsed it is just the input. The message history expands above it only while
 * the bar is active (focused/clicked) or a command is awaiting a response; clicking
 * anywhere off the bar collapses it again.
 */
export function ChatOverlay({
  tz,
  onNavigate,
}: {
  tz: string;
  onNavigate?: (ms: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Keep expanded while a turn is in flight (so the reply is visible as it lands).
  const feed = useQuery(api.commands.feed, { limit: 30 });
  const isRunning = !!feed?.some((t) => t.status === "running");
  const expanded = active || isRunning;

  // Collapse when the user clicks/taps anywhere outside the bar.
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setActive(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 sm:bottom-4">
      <div
        ref={panelRef}
        onMouseDown={() => setActive(true)}
        onFocusCapture={() => setActive(true)}
        className="pointer-events-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-2xl ring-1 ring-black/5 backdrop-blur-md"
      >
        {expanded && (
          <div className="max-h-[55vh] min-h-0 overflow-y-auto border-b border-white/60">
            <CommandFeed />
          </div>
        )}
        <CommandInput tz={tz} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
