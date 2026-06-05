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
  // Exact (case-sensitive) name match via index.
  const exact = await ctx.db
    .query("locations")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .unique();
  if (exact) return exact._id;

  // Otherwise match case-insensitively against name or any alias ("home"/"work").
  const needle = name.trim().toLowerCase();
  const all = await listLocationsForUser(ctx, userId);
  const aliased = all.find(
    (l) =>
      l.name.toLowerCase() === needle ||
      (l.aliases ?? []).some((a) => a.toLowerCase() === needle),
  );
  if (aliased) return aliased._id;

  return await ctx.db.insert("locations", {
    userId,
    name,
    color: color ?? colorForName(name),
    isHome: false,
  });
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
