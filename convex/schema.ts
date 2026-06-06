import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/** Recurrence rule validator (stored on a master event only). */
export const recurrenceValidator = v.object({
  freq: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("yearly"),
  ),
  interval: v.number(),
  byWeekday: v.optional(v.array(v.number())), // 0=Mon .. 6=Sun
  until: v.optional(v.number()), // civil int YYYYMMDD, inclusive
  count: v.optional(v.number()),
});

/** Per-occurrence override fields for a recurring master. */
export const overrideValidator = v.object({
  title: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
  locationId: v.optional(v.union(v.id("locations"), v.null())),
});

export default defineSchema({
  ...authTables,

  // Override the Convex Auth users table with app-specific fields.
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App fields:
    homeLocationId: v.optional(v.id("locations")),
    timezone: v.optional(v.string()), // IANA, e.g. "Europe/London"
    context: v.optional(v.string()), // free-text note appended to every agent prompt
  }).index("email", ["email"]),

  // Named, place-based locations with a colour, per user. Home is a location
  // flagged isHome. `aliases` maps common references (e.g. "home", "work") to the
  // place, acting as the user's "locations directory".
  locations: defineTable({
    userId: v.id("users"),
    name: v.string(), // a place/area, e.g. "Whitechapel", "Westminster"
    color: v.string(), // hex, drives the presence band colour
    isHome: v.boolean(),
    aliases: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),

  events: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    allDay: v.boolean(),

    // Timeblocked events: UTC epoch ms.
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    timezone: v.string(), // IANA tz the event was authored in

    // All-day events: civil-date ints YYYYMMDD (inclusive range).
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),

    // Presence: a location tag makes this event a location-setter.
    locationId: v.optional(v.id("locations")),
    // Presence: optional minutes spent at the location (defaults to event duration).
    stayMinutes: v.optional(v.number()),

    // Recurrence: present on the master event only.
    recurrence: v.optional(recurrenceValidator),
  })
    .index("by_user", ["userId"])
    .index("by_user_start", ["userId", "start"])
    .index("by_user_recurring", ["userId", "recurrence"]),

  // Per-occurrence overrides / cancellations for recurring masters.
  recurrenceExceptions: defineTable({
    userId: v.id("users"),
    masterId: v.id("events"),
    occurrenceDate: v.number(), // civil int YYYYMMDD identifying which occurrence
    cancelled: v.boolean(),
    override: v.optional(overrideValidator),
  })
    .index("by_master", ["masterId"])
    .index("by_master_date", ["masterId", "occurrenceDate"]),

  // Feed of LLM command turns (drives the chat/result feed).
  commandLog: defineTable({
    userId: v.id("users"),
    userText: v.string(),
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
  }).index("by_user", ["userId"]),

  // Self-modifying codegen jobs: a website message → a headless Claude Code run
  // in GitHub Actions that edits this repo and opens a PR. The runner reports
  // progress back via the /codegen/callback HTTP endpoint; reactivity streams
  // the status straight to the submitter's open tab.
  codegenJobs: defineTable({
    userId: v.id("users"),
    prompt: v.string(),
    status: v.union(
      v.literal("queued"), // row created, not yet handed to GitHub
      v.literal("dispatched"), // repository_dispatch fired, workflow may be cold-starting
      v.literal("running"), // workflow checked out the repo, Claude is working
      v.literal("pushed"), // Claude's change committed straight to main (deploy triggered)
      v.literal("no_changes"), // Claude ran but produced no diff
      v.literal("error"),
    ),
    summary: v.optional(v.string()), // Claude's description of what it did
    runUrl: v.optional(v.string()), // link to the GitHub Actions run
    commitSha: v.optional(v.string()), // sha pushed to main
    error: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Append-only marker of what git SHA is live in production. The post-merge
  // workflow writes a row; the frontend compares the latest SHA to the SHA it
  // was built with to know when an open tab is running stale code.
  appDeployments: defineTable({
    sha: v.string(),
    deployedAt: v.number(), // epoch ms, supplied by the workflow
  }),
});
