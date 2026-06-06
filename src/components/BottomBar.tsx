"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CommandFeed } from "./CommandFeed";
import { CommandInput } from "./CommandInput";
import { PlacesControl } from "./PlacesControl";
import { ContextControl } from "./ContextControl";

/**
 * The bottom bar floating over the calendar: one inline row, identical on web and
 * mobile. Left is the Places menu, the centre is the assistant chat (expands on
 * click to show history), and the right is the free-text Context note. A 3-column
 * grid keeps the chat centred regardless of the side buttons' widths.
 */
export function BottomBar({
  tz,
  onNavigate,
}: {
  tz: string;
  onNavigate?: (ms: number) => void;
}) {
  const chatRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Keep the chat expanded while a turn is in flight (so the reply is visible as
  // it lands). The feed defaults to the agent's context window (FEED_LIMIT).
  const feed = useQuery(api.commands.feed, {});
  const isRunning = !!feed?.some((t) => t.status === "running");
  const expanded = active || isRunning;

  // Collapse the chat when the user clicks/taps anywhere outside it.
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(e.target as Node)) {
        setActive(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 px-3 sm:bottom-4">
      {/* Left: places. */}
      <div className="pointer-events-auto justify-self-start">
        <PlacesControl />
      </div>

      {/* Centre: assistant chat. */}
      <div
        ref={chatRef}
        onMouseDown={() => setActive(true)}
        onFocusCapture={() => setActive(true)}
        className="pointer-events-auto flex w-full max-w-xl flex-col gap-2 justify-self-center"
      >
        {/* Ghost feed: transparent background, messages float over the calendar. */}
        {expanded && (
          <div className="max-h-[55vh] min-h-0 overflow-y-auto">
            <CommandFeed />
          </div>
        )}
        {/* Only the input keeps a frosted frame so it stays legible/usable. */}
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-2xl ring-1 ring-black/5 backdrop-blur-md">
          <CommandInput tz={tz} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Right: free-text context note. */}
      <div className="pointer-events-auto justify-self-end">
        <ContextControl />
      </div>
    </div>
  );
}
