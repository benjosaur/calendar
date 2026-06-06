import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, internalMutation, internalQuery } from "./_generated/server";

/** How many recent turns form the agent's context window — and, to match, how
 *  many the chat feed shows. One source of truth keeps the UI and the model's
 *  memory in lockstep. */
export const FEED_LIMIT = 6;

/** Chronological (asc) feed of the most recent command turns for the current
 *  user. The default mirrors the agent's context window (recentForUser) so the
 *  feed shows exactly the turns the model can still "remember". */
export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    // by_user index orders by creation time asc. Take the newest `limit` turns
    // by reading desc, then restore chronological (oldest-first) order.
    const rows = await ctx.db
      .query("commandLog")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? FEED_LIMIT);
    return rows.reverse();
  },
});

/** Internal: the most recent completed turns for a user (for agent context). */
export const recentForUser = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const rows = await ctx.db
      .query("commandLog")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? FEED_LIMIT);
    // Return chronological (oldest first) for use as message history.
    return rows
      .filter((r) => r.status === "done")
      .reverse()
      .map((r) => ({ userText: r.userText, assistantText: r.assistantText }));
  },
});

/** Internal: open a command-log row in the "running" state. */
export const start = internalMutation({
  args: { userId: v.id("users"), userText: v.string() },
  handler: async (ctx, { userId, userText }) => {
    return await ctx.db.insert("commandLog", {
      userId,
      userText,
      status: "running",
    });
  },
});

/** Internal: finalise a command-log row with the assistant result. */
export const finish = internalMutation({
  args: {
    id: v.id("commandLog"),
    assistantText: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          name: v.string(),
          input: v.any(),
          result: v.string(),
        }),
      ),
    ),
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, assistantText, toolCalls, status, error }) => {
    await ctx.db.patch(id, { assistantText, toolCalls, status, error });
    return null;
  },
});
