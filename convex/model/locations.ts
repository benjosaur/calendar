import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Palette for newly-created locations, chosen deterministically by name. Avoids
 * the home indigo (#6366f1) and the travel amber (#f59e0b) so presence bands for
 * away-locations stay visually distinct from Home and Travelling.
 */
export const LOCATION_PALETTE = [
  "#0ea5e9", // sky
  "#ec4899", // pink
  "#22c55e", // green
  "#ef4444", // red
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#06b6d4", // cyan
];

/** Stable hash → palette index so the same name always gets the same colour. */
export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % LOCATION_PALETTE.length;
  return LOCATION_PALETTE[idx];
}

/** Common colour names → palette hex, so "make it green" and a swatch click agree. */
const NAMED_COLORS: Record<string, string> = {
  blue: "#0ea5e9",
  sky: "#0ea5e9",
  pink: "#ec4899",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#a855f7",
  violet: "#a855f7",
  teal: "#14b8a6",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f59e0b",
  amber: "#f59e0b",
  yellow: "#eab308",
  indigo: "#6366f1",
};

/**
 * Resolve a user/agent-supplied colour into a hex string. Accepts a hex value
 * (`#rgb`/`#rrggbb`, returned as-is) or a common colour name; otherwise falls
 * back to a deterministic colour derived from `fallbackName`.
 */
export function resolveColor(input: string | undefined, fallbackName: string): string {
  if (input) {
    const trimmed = input.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
    const named = NAMED_COLORS[trimmed.toLowerCase()];
    if (named) return named;
  }
  return colorForName(fallbackName);
}

/**
 * Find a location for (userId, name): exact (indexed) match first, then a
 * case-insensitive match against name or any alias ("home"/"work"). Returns the
 * document or null. Shared by create/update/delete-by-name paths.
 */
export async function findLocationByName(
  ctx: QueryCtx,
  userId: Id<"users">,
  name: string,
) {
  const exact = await ctx.db
    .query("locations")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .unique();
  if (exact) return exact;

  const needle = name.trim().toLowerCase();
  const all = await listLocationsForUser(ctx, userId);
  return (
    all.find(
      (l) =>
        l.name.toLowerCase() === needle ||
        (l.aliases ?? []).some((a) => a.toLowerCase() === needle),
    ) ?? null
  );
}

/**
 * Find a location by (userId, name) via the by_user_name index, or create it.
 * Shared by the public `upsert` mutation and the internal `resolveOrCreate`.
 */
export async function resolveOrCreateLocation(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  color?: string,
): Promise<Id<"locations">> {
  // Match an existing place by name or alias before creating a new one.
  const existing = await findLocationByName(ctx, userId, name);
  if (existing) return existing._id;

  return await ctx.db.insert("locations", {
    userId,
    name,
    color: resolveColor(color, name),
    isHome: false,
  });
}

/** Rename and/or recolour a location the user owns. */
export async function updateLocationForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  locationId: Id<"locations">,
  patch: { name?: string; color?: string },
): Promise<null> {
  const target = await ctx.db.get(locationId);
  if (!target || target.userId !== userId) throw new Error("Location not found");

  const next: { name?: string; color?: string } = {};
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.color !== undefined) {
    next.color = resolveColor(patch.color, patch.name ?? target.name);
  }
  if (Object.keys(next).length > 0) await ctx.db.patch(locationId, next);
  return null;
}

/**
 * Delete a location the user owns. Refuses to delete the home place (set a new
 * home first). Clears `locationId` from any events that reference it so no
 * dangling references remain; presence then falls back to the neutral tone.
 */
export async function removeLocationForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  locationId: Id<"locations">,
): Promise<null> {
  const target = await ctx.db.get(locationId);
  if (!target || target.userId !== userId) throw new Error("Location not found");
  if (target.isHome) throw new Error("Can't delete the home place; set a new home first.");

  const events = await ctx.db
    .query("events")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const ev of events) {
    if (ev.locationId === locationId) {
      await ctx.db.patch(ev._id, { locationId: undefined });
    }
  }

  await ctx.db.delete(locationId);
  return null;
}

/** List all locations for a user (used by both public and internal queries). */
export async function listLocationsForUser(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("locations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/**
 * Make a location the user's home: validate ownership, sync every isHome flag,
 * and set user.homeLocationId. Shared by public `setHome` and internal `setHomeInternal`.
 */
export async function setHomeForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  locationId: Id<"locations">,
): Promise<null> {
  const target = await ctx.db.get(locationId);
  if (!target || target.userId !== userId) {
    throw new Error("Location not found");
  }

  const all = await listLocationsForUser(ctx, userId);
  for (const loc of all) {
    const shouldBeHome = loc._id === locationId;
    if (loc.isHome !== shouldBeHome) {
      await ctx.db.patch(loc._id, { isHome: shouldBeHome });
    }
  }
  await ctx.db.patch(userId, { homeLocationId: locationId });
  return null;
}
