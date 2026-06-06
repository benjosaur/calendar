import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import {
  civilForInstant,
  timedEventEndMs,
  timedOverlapsWindow,
} from "../../src/lib/time";
import { expandMaster, MasterLike } from "../../src/lib/recurrence";
import { Occurrence, Recurrence } from "../../src/lib/types";
import { colorForName } from "./locations";

/**
 * Shared events logic, called by both the public (auth-derived userId) and the
 * internal (explicit userId) wrappers. Keeping it here means the agent action and
 * the frontend run identical behaviour.
 */

type AnyCtx = QueryCtx | MutationCtx;

// ---------- Location resolution ----------

/** Find a location by (userId, name); create it with `color` if missing. */
async function resolveLocationByName(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  color?: string,
): Promise<Id<"locations">> {
  const existing = await ctx.db
    .query("locations")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("locations", {
    userId,
    name,
    color: color ?? colorForName(name),
    isHome: false,
  });
}

// ---------- Expansion ----------

/** Map a stored event Doc into a one-off Occurrence. */
function eventToOccurrence(ev: Doc<"events">): Occurrence {
  const occurrenceDate = ev.allDay
    ? (ev.startDate as number)
    : civilForInstant(ev.start as number, ev.timezone);
  return {
    occurrenceId: ev._id,
    eventId: ev._id,
    occurrenceDate,
    title: ev.title,
    description: ev.description,
    allDay: ev.allDay,
    start: ev.start,
    end: ev.end,
    timezone: ev.timezone,
    startDate: ev.startDate,
    endDate: ev.endDate,
    locationId: ev.locationId,
    stayMinutes: ev.stayMinutes,
    isRecurring: false,
  };
}

/**
 * Expand all of a user's events overlapping [fromMs, toMs) into concrete
 * Occurrences, applying recurrence rules and per-occurrence exceptions.
 */
export async function expandForRange(
  ctx: AnyCtx,
  userId: Id<"users">,
  fromMs: number,
  toMs: number,
  tz: string,
): Promise<Occurrence[]> {
  const winStartCivil = civilForInstant(fromMs, tz);
  const winEndCivil = civilForInstant(toMs, tz);
  const out: Occurrence[] = [];

  // Single scan of the user's events; recurring masters are handled in step 3.
  const allEvents = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const ev of allEvents) {
    if (ev.recurrence) continue; // recurring handled below

    if (ev.allDay) {
      // 2a) All-day events: inclusive [startDate, endDate] overlapping the civil window.
      const s = ev.startDate as number;
      const e = (ev.endDate ?? ev.startDate) as number;
      if (e >= winStartCivil && s <= winEndCivil) {
        out.push(eventToOccurrence(ev));
      }
    } else {
      // 2b) Timed events overlapping [fromMs, toMs). Use the presence footprint
      // (start .. start+stayMinutes), not just [start, end], so a short event
      // whose multi-day stay reaches into this week still renders its where-band.
      const s = ev.start as number;
      const e = timedEventEndMs(s, ev.end, ev.stayMinutes);
      if (timedOverlapsWindow(s, e, fromMs, toMs)) {
        out.push(eventToOccurrence(ev));
      }
    }
  }

  // 3) Recurring masters (recurrence set). Reuse the by_user scan above.
  const masters = allEvents.filter((ev) => ev.recurrence);
  for (const master of masters) {
    const instances = expandMaster(
      master as unknown as MasterLike,
      winStartCivil,
      winEndCivil,
    );
    for (const inst of instances) {
      const exception = await ctx.db
        .query("recurrenceExceptions")
        .withIndex("by_master_date", (q) =>
          q.eq("masterId", master._id).eq("occurrenceDate", inst.occurrenceDate),
        )
        .unique();
      if (exception?.cancelled) continue;

      const ov = exception?.override;
      out.push({
        occurrenceId: `${master._id}:${inst.occurrenceDate}`,
        eventId: master._id,
        masterId: master._id,
        occurrenceDate: inst.occurrenceDate,
        title: ov?.title ?? master.title,
        description: master.description,
        allDay: master.allDay,
        start: ov?.start ?? inst.start,
        end: ov?.end ?? inst.end,
        timezone: master.timezone,
        startDate: inst.startDate,
        endDate: inst.endDate,
        // override.locationId may be null to explicitly clear the tag.
        locationId:
          ov && "locationId" in ov
            ? (ov.locationId ?? undefined)
            : master.locationId,
        stayMinutes: master.stayMinutes,
        isRecurring: true,
      });
    }
  }

  return out;
}

// ---------- Create ----------

export interface CreateEventArgs {
  title: string;
  allDay: boolean;
  timezone: string;
  start?: number;
  end?: number;
  startDate?: number;
  endDate?: number;
  description?: string;
  locationId?: Id<"locations">;
  locationName?: string;
  stayMinutes?: number;
  recurrence?: Recurrence;
}

export async function createEventForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: CreateEventArgs,
): Promise<Id<"events">> {
  // Validate the shape matches the allDay flag.
  if (args.allDay) {
    if (args.startDate === undefined) {
      throw new Error("All-day event requires startDate.");
    }
    const end = args.endDate ?? args.startDate;
    if (end < args.startDate) {
      throw new Error("All-day event endDate must be >= startDate.");
    }
  } else {
    if (args.start === undefined || args.end === undefined) {
      throw new Error("Timed event requires start and end.");
    }
    if (args.end <= args.start) {
      throw new Error("Event end must be after start.");
    }
  }

  let locationId = args.locationId;
  if (!locationId && args.locationName) {
    locationId = await resolveLocationByName(ctx, userId, args.locationName);
  }

  return await ctx.db.insert("events", {
    userId,
    title: args.title,
    description: args.description,
    allDay: args.allDay,
    start: args.start,
    end: args.end,
    timezone: args.timezone,
    startDate: args.startDate,
    endDate: args.endDate,
    locationId,
    stayMinutes: args.stayMinutes,
    recurrence: args.recurrence,
  });
}

// ---------- Update ----------

export interface UpdateEventPatch {
  title?: string;
  description?: string;
  allDay?: boolean;
  start?: number;
  end?: number;
  startDate?: number;
  endDate?: number;
  locationId?: Id<"locations"> | null;
  stayMinutes?: number | null;
  recurrence?: Recurrence | null;
}

/** Load an event and assert it belongs to the user. */
async function requireOwnedEvent(
  ctx: AnyCtx,
  userId: Id<"users">,
  id: Id<"events">,
): Promise<Doc<"events">> {
  const ev = await ctx.db.get(id);
  if (!ev || ev.userId !== userId) throw new Error("Event not found.");
  return ev;
}

export async function updateEventForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"events">,
  patch: UpdateEventPatch,
): Promise<void> {
  const ev = await requireOwnedEvent(ctx, userId, id);

  // Resolve the effective post-patch times to validate ordering.
  const allDay = patch.allDay ?? ev.allDay;
  if (allDay) {
    const startDate = patch.startDate ?? ev.startDate;
    const endDate = patch.endDate ?? ev.endDate ?? startDate;
    if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
      throw new Error("All-day event endDate must be >= startDate.");
    }
  } else {
    const start = patch.start ?? ev.start;
    const end = patch.end ?? ev.end;
    if (start !== undefined && end !== undefined && end <= start) {
      throw new Error("Event end must be after start.");
    }
  }

  // Build the DB patch, translating explicit nulls into field removal.
  const dbPatch: Partial<Doc<"events">> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.allDay !== undefined) dbPatch.allDay = patch.allDay;
  if (patch.start !== undefined) dbPatch.start = patch.start;
  if (patch.end !== undefined) dbPatch.end = patch.end;
  if (patch.startDate !== undefined) dbPatch.startDate = patch.startDate;
  if (patch.endDate !== undefined) dbPatch.endDate = patch.endDate;
  if (patch.locationId !== undefined) {
    dbPatch.locationId = patch.locationId ?? undefined;
  }
  if (patch.stayMinutes !== undefined) {
    dbPatch.stayMinutes = patch.stayMinutes ?? undefined;
  }
  if (patch.recurrence !== undefined) {
    dbPatch.recurrence = patch.recurrence ?? undefined;
  }

  await ctx.db.patch(id, dbPatch);
}

// ---------- Delete (cascades exceptions) ----------

export async function deleteEventForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"events">,
): Promise<void> {
  await requireOwnedEvent(ctx, userId, id);
  const exceptions = await ctx.db
    .query("recurrenceExceptions")
    .withIndex("by_master", (q) => q.eq("masterId", id))
    .collect();
  for (const ex of exceptions) {
    await ctx.db.delete(ex._id);
  }
  await ctx.db.delete(id);
}

// ---------- Move (keep duration when newEnd omitted) ----------

export async function moveEventForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"events">,
  newStart: number,
  newEnd?: number,
): Promise<void> {
  const ev = await requireOwnedEvent(ctx, userId, id);
  if (ev.allDay || ev.start === undefined || ev.end === undefined) {
    throw new Error("Cannot move an all-day event with moveEvent.");
  }
  const end = newEnd ?? newStart + (ev.end - ev.start);
  if (end <= newStart) throw new Error("Event end must be after start.");
  await ctx.db.patch(id, { start: newStart, end });
}

// ---------- Resize ----------

export async function resizeEventForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"events">,
  newStart?: number,
  newEnd?: number,
): Promise<void> {
  const ev = await requireOwnedEvent(ctx, userId, id);
  if (ev.allDay || ev.start === undefined || ev.end === undefined) {
    throw new Error("Cannot resize an all-day event with resizeEvent.");
  }
  const start = newStart ?? ev.start;
  const end = newEnd ?? ev.end;
  if (end <= start) throw new Error("Event end must be after start.");
  await ctx.db.patch(id, { start, end });
}

// ---------- Per-occurrence override / cancel ----------

export interface OccurrenceOverride {
  title?: string;
  start?: number;
  end?: number;
  locationId?: Id<"locations"> | null;
}

/** Upsert the recurrenceExceptions row for (master, occurrenceDate). */
async function upsertException(
  ctx: MutationCtx,
  userId: Id<"users">,
  masterId: Id<"events">,
  occurrenceDate: number,
  fields: { cancelled?: boolean; override?: OccurrenceOverride },
): Promise<void> {
  const master = await requireOwnedEvent(ctx, userId, masterId);
  if (!master.recurrence) {
    throw new Error("Event is not recurring.");
  }
  const existing = await ctx.db
    .query("recurrenceExceptions")
    .withIndex("by_master_date", (q) =>
      q.eq("masterId", masterId).eq("occurrenceDate", occurrenceDate),
    )
    .unique();

  if (existing) {
    const patch: Partial<Doc<"recurrenceExceptions">> = {};
    if (fields.cancelled !== undefined) patch.cancelled = fields.cancelled;
    if (fields.override !== undefined) patch.override = fields.override;
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("recurrenceExceptions", {
      userId,
      masterId,
      occurrenceDate,
      cancelled: fields.cancelled ?? false,
      override: fields.override,
    });
  }
}

export async function editOccurrenceForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  masterId: Id<"events">,
  occurrenceDate: number,
  override: OccurrenceOverride,
): Promise<void> {
  if (
    override.start !== undefined &&
    override.end !== undefined &&
    override.end <= override.start
  ) {
    throw new Error("Occurrence end must be after start.");
  }
  await upsertException(ctx, userId, masterId, occurrenceDate, { override });
}

export async function cancelOccurrenceForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  masterId: Id<"events">,
  occurrenceDate: number,
): Promise<void> {
  await upsertException(ctx, userId, masterId, occurrenceDate, {
    cancelled: true,
  });
}
