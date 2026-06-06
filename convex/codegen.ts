import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

// Fields the GitHub Actions runner is allowed to patch onto a job via the
// /codegen/callback HTTP endpoint. Mirrors the optional columns in the schema.
const callbackPatch = {
  status: v.optional(
    v.union(
      v.literal("running"),
      v.literal("pushed"),
      v.literal("no_changes"),
      v.literal("error"),
    ),
  ),
  summary: v.optional(v.string()),
  runUrl: v.optional(v.string()),
  commitSha: v.optional(v.string()),
  error: v.optional(v.string()),
};

// ---------- Public API (called from the website) ----------

/** Submit a natural-language change request. Returns the new job id. */
export const submit = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const trimmed = prompt.trim();
    if (trimmed.length === 0) throw new Error("Prompt is empty");
    if (trimmed.length > 4000) throw new Error("Prompt is too long");

    const jobId = await ctx.db.insert("codegenJobs", {
      userId,
      prompt: trimmed,
      status: "queued",
    });

    // Hand off to GitHub outside the transaction: actions can't run in a
    // mutation, and we never want the dispatch HTTP call to block the write.
    await ctx.scheduler.runAfter(0, internal.codegen.dispatch, { jobId });
    return jobId;
  },
});

/** Live feed of the current user's codegen jobs (newest last). */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("codegenJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 20);
  },
});

/** The SHA currently live in production, for the stale-tab version check. */
export const liveVersion = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("appDeployments").order("desc").take(1);
    return latest[0]?.sha ?? null;
  },
});

// ---------- Internal: dispatch to GitHub Actions ----------

/**
 * Fire a `repository_dispatch` event so GitHub Actions runs a headless Claude
 * Code job against this repo. Runs as an action because it does network I/O;
 * `fetch` works in the default runtime, so no `"use node"` is needed.
 *
 * Required Convex env vars (set with `bunx convex env set ...`):
 *   GITHUB_REPO            owner/name, e.g. "benjo/calendar"
 *   GITHUB_DISPATCH_TOKEN  PAT/fine-grained token with `actions: write`
 *   CODEGEN_CALLBACK_SECRET shared secret the runner echoes back on callbacks
 */
export const dispatch = internalAction({
  args: { jobId: v.id("codegenJobs") },
  handler: async (ctx, { jobId }) => {
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const callbackUrl = `${process.env.CONVEX_SITE_URL}/codegen/callback`;

    if (!repo || !token) {
      await ctx.runMutation(internal.codegen.fail, {
        jobId,
        error: "Server missing GITHUB_REPO or GITHUB_DISPATCH_TOKEN",
      });
      return null;
    }

    const job = await ctx.runQuery(internal.codegen.get, { jobId });
    if (!job) return null;

    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "codegen",
        client_payload: { jobId, prompt: job.prompt, callbackUrl },
      }),
    });

    if (!res.ok) {
      await ctx.runMutation(internal.codegen.fail, {
        jobId,
        error: `GitHub dispatch failed: ${res.status} ${await res.text()}`,
      });
      return null;
    }

    await ctx.runMutation(internal.codegen.markDispatched, { jobId });
    return null;
  },
});

// ---------- Internal: state transitions ----------

export const get = internalQuery({
  args: { jobId: v.id("codegenJobs") },
  handler: async (ctx, { jobId }) => ctx.db.get(jobId),
});

/** Generic patch used by `dispatch` and the HTTP callback. */
export const patch = internalMutation({
  args: { jobId: v.id("codegenJobs"), patch: v.object(callbackPatch) },
  handler: async (ctx, { jobId, patch }) => {
    await ctx.db.patch(jobId, patch);
    return null;
  },
});

export const markDispatched = internalMutation({
  args: { jobId: v.id("codegenJobs") },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, { status: "dispatched" });
    return null;
  },
});

export const fail = internalMutation({
  args: { jobId: v.id("codegenJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    await ctx.db.patch(jobId, { status: "error", error });
    return null;
  },
});

/** Record a production deployment SHA (called by the post-merge workflow). */
export const recordDeployment = internalMutation({
  args: { sha: v.string(), deployedAt: v.number() },
  handler: async (ctx, { sha, deployedAt }) => {
    await ctx.db.insert("appDeployments", { sha, deployedAt });
    return null;
  },
});
