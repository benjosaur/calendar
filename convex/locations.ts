import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import {
  resolveOrCreateLocation,
  listLocationsForUser,
  setHomeForUser,
} from "./model/locations";

/** All locations for the current user (LocationLite shape). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await listLocationsForUser(ctx, userId);
  },
});

/** Find-or-create a location by name for the current user. */
export const upsert = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { name, color }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await resolveOrCreateLocation(ctx, userId, name, color);
  },
});

/** Make a location the user's home: set user.homeLocationId and sync isHome flags. */
export const setHome = mutation({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await setHomeForUser(ctx, userId, locationId);
  },
});

/** Internal: set home for an explicit user (agent action). */
export const setHomeInternal = internalMutation({
  args: { userId: v.id("users"), locationId: v.id("locations") },
  handler: async (ctx, { userId, locationId }) => {
    return await setHomeForUser(ctx, userId, locationId);
  },
});

/** Internal: list locations for an explicit user (agent action). */
export const listForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await listLocationsForUser(ctx, userId);
  },
});

/** Internal: find-or-create a location for an explicit user (agent action). */
export const resolveOrCreate = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, color }) => {
    return await resolveOrCreateLocation(ctx, userId, name, color);
  },
});
