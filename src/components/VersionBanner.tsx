"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Shows a "reload" prompt when the SHA live in production no longer matches the
 * SHA this tab was built with — i.e. a codegen change merged and Vercel
 * redeployed while the tab stayed open. Convex reactivity delivers the new SHA
 * live; Vercel itself never refreshes an open tab.
 */
export function VersionBanner() {
  const liveSha = useQuery(api.codegen.liveVersion);
  const builtSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

  // No marker yet, local dev, or in sync → nothing to show.
  if (!liveSha || builtSha === "dev" || liveSha === builtSha) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 bg-neutral-900 px-4 py-2 text-sm text-white"
    >
      <span>A new version of the app is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded bg-white px-2 py-0.5 font-medium text-neutral-900 hover:bg-neutral-200"
      >
        Reload
      </button>
    </div>
  );
}
