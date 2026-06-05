"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";

/**
 * Chronological feed of agent command turns. Newest at the bottom; auto-scrolls
 * to the latest turn whenever the feed grows or a turn's status changes.
 */
export function CommandFeed() {
  const turns = useQuery(api.commands.feed, { limit: 30 }) as
    | Doc<"commandLog">[]
    | undefined;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest turn. Keyed on count + last status so it also
  // scrolls when a "running" turn resolves into "done"/"error".
  const last = turns?.[turns.length - 1];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns?.length, last?.status, last?.assistantText]);

  return (
    <div className="space-y-4 p-3">
      {turns === undefined && (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}
      {turns?.length === 0 && (
        <p className="text-sm text-neutral-500">
          No commands yet. Ask the assistant to schedule something.
        </p>
      )}
      {turns?.map((turn) => (
        <div key={turn._id} className="space-y-1 text-sm">
          {/* User message */}
          <div className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-indigo-600 px-3 py-2 text-white">
              {turn.userText}
            </p>
          </div>

          {/* Assistant response / status */}
          <div className="flex justify-start">
            <div className="max-w-[85%] space-y-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-neutral-800">
              {turn.status === "running" && (
                <p className="flex items-center gap-1.5 text-neutral-500">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
                  running…
                </p>
              )}
              {turn.status === "error" && (
                <p className="text-red-600">
                  {turn.error ?? "Something went wrong."}
                </p>
              )}
              {turn.assistantText && (
                <p className="whitespace-pre-wrap">{turn.assistantText}</p>
              )}
              {turn.toolCalls && turn.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {turn.toolCalls.map((tc: { name: string }, i: number) => (
                    <span
                      key={i}
                      className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600"
                    >
                      {tc.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
