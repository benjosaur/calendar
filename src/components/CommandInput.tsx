"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Free-text command box that fires the agent action. Enter submits,
 * Shift+Enter inserts a newline. Disabled while a command is in flight.
 */
export function CommandInput({
  tz,
  onNavigate,
  expanded = false,
}: {
  tz: string;
  /** Called with the UTC instant of an event the command created/moved, so the
   *  view can switch to that week. */
  onNavigate?: (ms: number) => void;
  /** When collapsed the box is just a placeholder line — the Send button only
   *  appears once the chat is expanded (focused/active or a turn is running). */
  expanded?: boolean;
}) {
  const runCommand = useAction(api.agent.runCommand);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    // Capture the wall-clock instant at submit time for relative phrasing ("tomorrow").
    const nowMs = Date.now();
    try {
      const res = await runCommand({ text: trimmed, tz, nowMs });
      setText("");
      if (res?.focusMs !== undefined) onNavigate?.(res.focusMs);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex items-stretch gap-2 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label="Command"
        className="min-h-[44px] flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
        placeholder="Ask anything…"
        rows={1}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter keeps the default newline behaviour.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {/* Send only exists in the expanded state — the collapsed bar is a bare
          placeholder line. Stretched to match the input box height. */}
      {expanded && (
        <button
          type="submit"
          className="shrink-0 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || text.trim().length === 0}
        >
          {pending ? "…" : "Send"}
        </button>
      )}
    </form>
  );
}
