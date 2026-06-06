"use node";

import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { Occurrence } from "../src/lib/types";
import {
  isoToUtcMs,
  isoDateToCivil,
  utcMsToIso,
  wallToUtcMs,
} from "../src/lib/time";

/** Recurrence shape the model emits (matches recurrenceValidator's fields). */
type AgentRecurrence = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byWeekday?: number[];
  until?: string; // YYYY-MM-DD
  count?: number;
};

/** Anthropic tool definitions exposed to the model. */
const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_event",
    description:
      "Create a calendar event. Use start/end (timezone-qualified ISO 8601) for timed events, or allDay:true with startDate/endDate (YYYY-MM-DD) for all-day events.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO 8601 start (timed events)" },
        end: { type: "string", description: "ISO 8601 end (timed events)" },
        allDay: { type: "boolean" },
        startDate: { type: "string", description: "YYYY-MM-DD (all-day)" },
        endDate: { type: "string", description: "YYYY-MM-DD (all-day, inclusive)" },
        location: {
          type: "string",
          description: "Location name; prefer an existing one.",
        },
        stayMinutes: {
          type: "number",
          description:
            "How long you remain at the location, in minutes, for the presence layer. Defaults to the event's duration. Use for multi-day stays, e.g. two days = 2880. A 30-minute travel buffer before and after is added automatically.",
        },
        description: { type: "string" },
        recurrence: {
          type: "object",
          properties: {
            freq: {
              type: "string",
              enum: ["daily", "weekly", "monthly", "yearly"],
            },
            interval: { type: "number" },
            byWeekday: {
              type: "array",
              items: { type: "number" },
              description: "Weekly only: 0=Mon .. 6=Sun",
            },
            until: { type: "string", description: "YYYY-MM-DD, inclusive" },
            count: { type: "number" },
          },
          required: ["freq", "interval"],
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_event",
    description: "Update fields of an existing event by id.",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            start: { type: "string", description: "ISO 8601" },
            end: { type: "string", description: "ISO 8601" },
            location: { type: "string" },
            allDay: { type: "boolean" },
            stayMinutes: {
              type: "number",
              description: "Minutes spent at the location for presence (see create_event).",
            },
          },
        },
      },
      required: ["eventId", "patch"],
    },
  },
  {
    name: "move_event",
    description:
      "Move a timed event to a new start (and optional new end). If newEnd is omitted the duration is preserved.",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        newStart: { type: "string", description: "ISO 8601" },
        newEnd: { type: "string", description: "ISO 8601" },
      },
      required: ["eventId", "newStart"],
    },
  },
  {
    name: "delete_event",
    description:
      "Delete an event. Pass occurrenceDate (YYYY-MM-DD) to cancel a single occurrence of a recurring event instead of the whole series.",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        occurrenceDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "query_events",
    description:
      "List the user's events (expanded occurrences) within a time range. Use this to find an event's id before moving or deleting.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO 8601 range start" },
        to: { type: "string", description: "ISO 8601 range end" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "set_home_location",
    description: "Set the user's home location, creating it if it does not exist.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        color: { type: "string", description: "hex colour" },
      },
      required: ["name"],
    },
  },
];

/** Build the grounding system prompt. */
function buildSystemPrompt(
  nowMs: number,
  tz: string,
  locations: {
    _id: Id<"locations">;
    name: string;
    isHome: boolean;
    aliases?: string[];
  }[],
): string {
  const now = DateTime.fromMillis(nowMs, { zone: tz });
  const human = now.toFormat("cccc, d LLLL yyyy 'at' HH:mm");
  const iso = now.toISO() ?? new Date(nowMs).toISOString();
  const locLines = locations.length
    ? locations
        .map((l) => {
          const aka = (l.aliases ?? []).length
            ? ` (aka: ${(l.aliases ?? []).join(", ")})`
            : "";
          return `- ${l.name}${l.isHome ? " [HOME]" : ""}${aka}`;
        })
        .join("\n")
    : "- (none yet)";

  return [
    "You are a calendar assistant. You manage the user's calendar via the provided tools.",
    "",
    `Current date and time: ${human} (${iso}).`,
    `User's IANA timezone: ${tz}.`,
    "",
    "The user's known places (their locations directory):",
    locLines,
    "",
    "Rules:",
    "- Resolve relative dates ('tomorrow', 'next Tuesday', 'in 2 weeks') against the current date and time above.",
    "- Always emit timezone-qualified ISO 8601 for timed values (e.g. 2026-06-05T09:00:00+01:00) and YYYY-MM-DD for all-day dates and recurrence boundaries.",
    "- LOCATIONS ARE PLACE-BASED: a location must be a real place or area (e.g. 'Whitechapel', 'Westminster', 'Shoreditch'), never a vague venue like 'the cafe' or 'the office'.",
    "- Resolve aliases and references using the directory above (e.g. 'home' -> the [HOME] place, 'work' -> its place). Pass the PLACE NAME to the tools.",
    "- If the user names a venue/place you cannot map to a specific area from the directory (e.g. 'the cafe'), DO NOT create it or guess. Instead reply WITHOUT calling tools, asking a brief follow-up for the area (e.g. 'Which area is the cafe in?'). Use the conversation so far to fill in answers to your earlier questions.",
    "- Before a destructive action (move or delete) where the target event is ambiguous, first call query_events to find the correct event id. Never invent event ids.",
    "- After completing the user's request, reply with a short natural-language confirmation.",
  ].join("\n");
}

/** Resolve a location name to an id via the internal mutation. */
async function resolveLocation(
  ctx: any,
  userId: Id<"users">,
  name: string | undefined,
): Promise<Id<"locations"> | undefined> {
  if (!name) return undefined;
  return await ctx.runMutation(internal.locations.resolveOrCreate, {
    userId,
    name,
  });
}

/** Convert the model's recurrence (ISO until) into the stored validator shape. */
function toStoredRecurrence(
  r: AgentRecurrence | undefined,
): {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byWeekday?: number[];
  until?: number;
  count?: number;
} | undefined {
  if (!r) return undefined;
  return {
    freq: r.freq,
    interval: r.interval,
    byWeekday: r.byWeekday,
    until: r.until ? isoDateToCivil(r.until) : undefined,
    count: r.count,
  };
}

type ToolCallLog = { name: string; input: unknown; result: string };

type ToolOutcome = { result: string; focusMs?: number };

/** Dispatch a single tool_use block to the matching internal function. Never throws. */
async function dispatchTool(
  ctx: any,
  userId: Id<"users">,
  tz: string,
  name: string,
  input: any,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "create_event": {
        const allDay = input.allDay === true;
        const locationId = await resolveLocation(ctx, userId, input.location);
        const start = input.start ? isoToUtcMs(input.start, tz) : undefined;
        const startDate = input.startDate ? isoDateToCivil(input.startDate) : undefined;
        const id = await ctx.runMutation(internal.events.createInternal, {
          userId,
          title: input.title,
          allDay,
          timezone: tz,
          start,
          end: input.end ? isoToUtcMs(input.end, tz) : undefined,
          startDate,
          endDate: input.endDate ? isoDateToCivil(input.endDate) : undefined,
          description: input.description,
          locationId,
          stayMinutes: input.stayMinutes,
          recurrence: toStoredRecurrence(input.recurrence),
        });
        const focusMs =
          start ?? (startDate ? wallToUtcMs(startDate, 0, tz) : undefined);
        return { result: `Created event ${id}.`, focusMs };
      }
      case "update_event": {
        const p = input.patch ?? {};
        const patch: Record<string, unknown> = {};
        if (p.title !== undefined) patch.title = p.title;
        if (p.start !== undefined) patch.start = isoToUtcMs(p.start, tz);
        if (p.end !== undefined) patch.end = isoToUtcMs(p.end, tz);
        if (p.allDay !== undefined) patch.allDay = p.allDay;
        if (p.stayMinutes !== undefined) patch.stayMinutes = p.stayMinutes;
        if (p.location !== undefined) {
          patch.locationId = await resolveLocation(ctx, userId, p.location) ?? null;
        }
        await ctx.runMutation(internal.events.updateInternal, {
          userId,
          id: input.eventId as Id<"events">,
          patch,
        });
        return {
          result: `Updated event ${input.eventId}.`,
          focusMs: patch.start as number | undefined,
        };
      }
      case "move_event": {
        const newStart = isoToUtcMs(input.newStart, tz);
        await ctx.runMutation(internal.events.moveInternal, {
          userId,
          id: input.eventId as Id<"events">,
          newStart,
          newEnd: input.newEnd ? isoToUtcMs(input.newEnd, tz) : undefined,
        });
        return { result: `Moved event ${input.eventId}.`, focusMs: newStart };
      }
      case "delete_event": {
        if (input.occurrenceDate) {
          await ctx.runMutation(internal.events.cancelOccurrenceInternal, {
            userId,
            masterId: input.eventId as Id<"events">,
            occurrenceDate: isoDateToCivil(input.occurrenceDate),
          });
          return {
            result: `Cancelled occurrence ${input.occurrenceDate} of event ${input.eventId}.`,
          };
        }
        await ctx.runMutation(internal.events.deleteInternal, {
          userId,
          id: input.eventId as Id<"events">,
        });
        return { result: `Deleted event ${input.eventId}.` };
      }
      case "query_events": {
        const fromMs = isoToUtcMs(input.from, tz);
        const toMs = isoToUtcMs(input.to, tz);
        const occurrences = await ctx.runQuery(internal.events.rangeForUser, {
          userId,
          fromMs,
          toMs,
          tz,
        });
        // Project to a compact, human-readable form for the model.
        const projected = (occurrences as Occurrence[]).map((o) => ({
          eventId: o.eventId,
          masterId: o.masterId,
          occurrenceDate: o.occurrenceDate,
          title: o.title,
          allDay: o.allDay,
          start: o.start !== undefined ? utcMsToIso(o.start, tz) : undefined,
          end: o.end !== undefined ? utcMsToIso(o.end, tz) : undefined,
          startDate: o.startDate,
          endDate: o.endDate,
          locationId: o.locationId,
          isRecurring: o.isRecurring,
        }));
        return { result: JSON.stringify(projected) };
      }
      case "set_home_location": {
        const locationId = await ctx.runMutation(
          internal.locations.resolveOrCreate,
          { userId, name: input.name, color: input.color },
        );
        await ctx.runMutation(internal.locations.setHomeInternal, {
          userId,
          locationId,
        });
        return { result: `Set home location to ${input.name}.` };
      }
      default:
        return { result: `Unknown tool: ${name}.` };
    }
  } catch (err) {
    // Surface the error to the model so it can self-correct rather than aborting.
    return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const MAX_ITERATIONS = 6;

/** Shared handler so the action body stays tidy and `ctx` keeps its precise type. */
async function runCommandHandler(
  ctx: any,
  args: { text: string; tz: string; nowMs: number },
): Promise<{ ok: boolean; focusMs?: number }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");

  const logId: Id<"commandLog"> = await ctx.runMutation(
    internal.commands.start,
    { userId, userText: args.text },
  );

  const toolCalls: ToolCallLog[] = [];
  let assistantText = "";
  let focusMs: number | undefined;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const client = new Anthropic({ apiKey });

    const locations = await ctx.runQuery(internal.locations.listForUser, {
      userId,
    });
    const system = buildSystemPrompt(args.nowMs, args.tz, locations);

    // Recent completed turns become prior conversation so the model can ask a
    // follow-up question and use the user's next message as the answer.
    const history: { userText: string; assistantText?: string }[] =
      await ctx.runQuery(internal.commands.recentForUser, { userId });

    const messages: Anthropic.MessageParam[] = [];
    for (const turn of history) {
      messages.push({ role: "user", content: turn.userText });
      if (turn.assistantText) {
        messages.push({ role: "assistant", content: turn.assistantText });
      }
    }
    messages.push({ role: "user", content: args.text });

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages,
        tools: TOOLS,
      });

      // Record the assistant turn so tool_result blocks have something to reference.
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        // Final answer: collect any text blocks.
        assistantText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      // Execute every tool_use block and feed results back as a user turn.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const outcome = await dispatchTool(
          ctx,
          userId,
          args.tz,
          block.name,
          block.input,
        );
        if (outcome.focusMs !== undefined) focusMs = outcome.focusMs;
        toolCalls.push({ name: block.name, input: block.input, result: outcome.result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: outcome.result,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    await ctx.runMutation(internal.commands.finish, {
      id: logId,
      assistantText: assistantText || undefined,
      toolCalls,
      status: "done" as const,
    });
    return { ok: true, focusMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.commands.finish, {
      id: logId,
      assistantText: assistantText || undefined,
      toolCalls,
      status: "error" as const,
      error: message,
    });
    return { ok: false };
  }
}

/** Natural-language calendar command, executed via an Anthropic tool loop. */
export const runCommand = action({
  args: { text: v.string(), tz: v.string(), nowMs: v.number() },
  handler: runCommandHandler,
});
