import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { recurrenceValidator, overrideValidator } from "./schema";
import {
  cancelOccurrenceForUser,
  createEventForUser,
  deleteEventForUser,
  editOccurrenceForUser,
  expandForRange,
  moveEventForUser,
  resizeEventForUser,
  updateEventForUser,
} from "./model/events";

/** Validator for the createEvent argument surface, shared by public + internal. */
const createArgs = {
  title: v.string(),
  allDay: v.boolean(),
  timezone: v.string(),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  description: v.optional(v.string()),
  locationId: v.optional(v.id("locations")),
  locationName: v.optional(v.string()),
  stayMinutes: v.optional(v.number()),
  recurrence: v.optional(recurrenceValidator),
};

/** Validator for the updateEvent patch object. */
const updatePatch = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  allDay: v.optional(v.boolean()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  locationId: v.optional(v.union(v.id("locations"), v.null())),
  stayMinutes: v.optional(v.union(v.number(), v.null())),
  recurrence: v.optional(v.union(recurrenceValidator, v.null())),
});

/** Derive the current authenticated user id or throw. */
async function requireUser(ctx: {
  auth: import("convex/server").Auth;
}): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated.");
  return userId;
}

// ---------- Queries ----------

export const eventsForWeek = query({
  args: { weekStartMs: v.number(), weekEndMs: v.number(), tz: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await expandForRange(
      ctx,
      userId,
      args.weekStartMs,
      args.weekEndMs,
      args.tz,
    );
  },
});

export const rangeForUser = internalQuery({
  args: {
    userId: v.id("users"),
    fromMs: v.number(),
    toMs: v.number(),
    tz: v.string(),
  },
  handler: async (ctx, args) => {
    return await expandForRange(
      ctx,
      args.userId,
      args.fromMs,
      args.toMs,
      args.tz,
    );
  },
});

// ---------- Mutations: create ----------

export const createEvent = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await createEventForUser(ctx, userId, args);
  },
});

export const createInternal = internalMutation({
  args: { userId: v.id("users"), ...createArgs },
  handler: async (ctx, { userId, ...args }) => {
    return await createEventForUser(ctx, userId, args);
  },
});

// ---------- Mutations: update ----------

export const updateEvent = mutation({
  args: { id: v.id("events"), patch: updatePatch },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await updateEventForUser(ctx, userId, args.id, args.patch);
    return null;
  },
});

export const updateInternal = internalMutation({
  args: { userId: v.id("users"), id: v.id("events"), patch: updatePatch },
  handler: async (ctx, args) => {
    await updateEventForUser(ctx, args.userId, args.id, args.patch);
    return null;
  },
});

// ---------- Mutations: delete ----------

export const deleteEvent = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await deleteEventForUser(ctx, userId, args.id);
    return null;
  },
});

export const deleteInternal = internalMutation({
  args: { userId: v.id("users"), id: v.id("events") },
  handler: async (ctx, args) => {
    await deleteEventForUser(ctx, args.userId, args.id);
    return null;
  },
});

// ---------- Mutations: move ----------

export const moveEvent = mutation({
  args: { id: v.id("events"), newStart: v.number(), newEnd: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await moveEventForUser(ctx, userId, args.id, args.newStart, args.newEnd);
    return null;
  },
});

export const moveInternal = internalMutation({
  args: {
    userId: v.id("users"),
    id: v.id("events"),
    newStart: v.number(),
    newEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await moveEventForUser(ctx, args.userId, args.id, args.newStart, args.newEnd);
    return null;
  },
});

// ---------- Mutations: resize ----------

export const resizeEvent = mutation({
  args: {
    id: v.id("events"),
    newStart: v.optional(v.number()),
    newEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await resizeEventForUser(ctx, userId, args.id, args.newStart, args.newEnd);
    return null;
  },
});

// ---------- Mutations: per-occurrence override / cancel ----------

export const editOccurrence = mutation({
  args: {
    masterId: v.id("events"),
    occurrenceDate: v.number(),
    override: overrideValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await editOccurrenceForUser(
      ctx,
      userId,
      args.masterId,
      args.occurrenceDate,
      args.override,
    );
    return null;
  },
});

export const editOccurrenceInternal = internalMutation({
  args: {
    userId: v.id("users"),
    masterId: v.id("events"),
    occurrenceDate: v.number(),
    override: overrideValidator,
  },
  handler: async (ctx, args) => {
    await editOccurrenceForUser(
      ctx,
      args.userId,
      args.masterId,
      args.occurrenceDate,
      args.override,
    );
    return null;
  },
});

export const cancelOccurrence = mutation({
  args: { masterId: v.id("events"), occurrenceDate: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await cancelOccurrenceForUser(
      ctx,
      userId,
      args.masterId,
      args.occurrenceDate,
    );
    return null;
  },
});

export const cancelOccurrenceInternal = internalMutation({
  args: {
    userId: v.id("users"),
    masterId: v.id("events"),
    occurrenceDate: v.number(),
  },
  handler: async (ctx, args) => {
    await cancelOccurrenceForUser(
      ctx,
      args.userId,
      args.masterId,
      args.occurrenceDate,
    );
    return null;
  },
});
