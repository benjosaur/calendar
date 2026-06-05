import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Idempotently seed a newly-created user with a place-based "locations directory":
 * a home place (Whitechapel, aliased "home") and a work place (Westminster, aliased
 * "work"), plus a default timezone. Also migrates the older "Home, Whitechapel"
 * name to the simplified place name. Safe to call repeatedly.
 */
export async function ensureSetupForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) return;

  if (!user.homeLocationId) {
    const homeLocationId = await ctx.db.insert("locations", {
      userId,
      name: "Whitechapel",
      color: "#6366f1",
      isHome: true,
      aliases: ["home"],
    });
    await ctx.db.patch(userId, { homeLocationId });

    // Seed a common "work" place so aliases resolve out of the box.
    await ctx.db.insert("locations", {
      userId,
      name: "Westminster",
      color: "#0ea5e9",
      isHome: false,
      aliases: ["work"],
    });
  } else {
    // Migrate the old combined name to the simplified place name + alias.
    const home = await ctx.db.get(user.homeLocationId);
    if (home && (home.name === "Home, Whitechapel" || home.name === "Home")) {
      await ctx.db.patch(home._id, {
        name: "Whitechapel",
        aliases: home.aliases ?? ["home"],
      });
    }
  }

  if (!user.timezone) {
    await ctx.db.patch(userId, { timezone: "Europe/London" });
  }
}
