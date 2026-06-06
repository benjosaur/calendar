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
  updateLocationForUser,
  removeLocationForUser,
  findLocationByName,
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

/** Rename and/or recolour one of the current user's locations. */
export const update = mutation({
  args: {
    locationId: v.id("locations"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { locationId, name, color }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await updateLocationForUser(ctx, userId, locationId, { name, color });
  },
});

/** Delete one of the current user's locations (not the home place). */
export const remove = mutation({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await removeLocationForUser(ctx, userId, locationId);
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

/** Internal: rename/recolour a place by name for an explicit user (agent action). */
export const updateByNameInternal = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    newName: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, newName, color }) => {
    const loc = await findLocationByName(ctx, userId, name);
    if (!loc) throw new Error(`No place named "${name}".`);
    return await updateLocationForUser(ctx, userId, loc._id, {
      name: newName,
      color,
    });
  },
});

/** Internal: delete a place by name for an explicit user (agent action). */
export const removeByNameInternal = internalMutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, { userId, name }) => {
    const loc = await findLocationByName(ctx, userId, name);
    if (!loc) throw new Error(`No place named "${name}".`);
    return await removeLocationForUser(ctx, userId, loc._id);
  },
});
