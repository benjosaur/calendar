"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Right-hand control of the bottom bar: an "ℹ Context" button opening an upward
 * popover with a free-text note (e.g. "My home is in Whitechapel"). The note is
 * saved on the user's profile and appended to every agent prompt.
 */
export function ContextControl() {
  const me = useQuery(api.users.currentUser);
  const setContext = useMutation(api.users.setContext);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  // Seed the editor from the saved context the first time it loads / when opening.
  const remote = me?.context ?? "";
  useEffect(() => {
    if (open) setText(remote);
  }, [open, remote]);

  // Collapse when clicking anywhere outside the control (saving first).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        if (text !== remote) void setContext({ context: text });
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, text, remote, setContext]);

  async function save() {
    await setContext({ context: text });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const hasNote = (me?.context ?? "").trim().length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-2xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm font-medium text-neutral-700 shadow-2xl ring-1 ring-black/5 backdrop-blur-md hover:bg-white/90"
      >
        <span aria-hidden className="text-base leading-none">ℹ︎</span>
        <span>Context</span>
        {hasNote && (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-72 overflow-hidden rounded-2xl border border-white/60 bg-white/90 p-3 shadow-2xl ring-1 ring-black/5 backdrop-blur-md">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">
            Context for the assistant
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. My home is in Whitechapel; I prefer mornings; I commute by bike."
            className="w-full resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              {saved ? "Saved" : "Appended to every chat prompt"}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={text === remote}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
