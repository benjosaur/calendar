import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery } from "./_generated/server";
import { ensureSetupForUser } from "./model/users";

/** The signed-in user's document (incl. homeLocationId, timezone), or null. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * Idempotent seed of the home location + timezone for the current user.
 * Mirrors the auth callback as a safety net (e.g. for pre-existing users).
 */
export const ensureSetup = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    await ensureSetupForUser(ctx, userId);
    return null;
  },
});

/** Internal: fetch a user by id (for the agent action). */
export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});
