# calendar

A minimal, text-driven calendar app. Next.js + Convex, with an Anthropic
tool-calling agent as the primary interface.

## Features

- **Week view** — all seven days (Mon–Sun) in a single row, weekend beside the weekdays.
  Time runs down the y-axis (hour gutter on the left), 07:00–24:00, sized to fit the
  screen without scrolling.
- **Text-first interface** — type natural language ("schedule lunch with Sarah at noon
  tomorrow at the cafe", "move my 3pm to 4pm", "what's my Friday look like"). The text is
  sent to the Anthropic API with **tool calling** inside a Convex action, which maps the
  model's tool calls to calendar mutations.
- **Direct manipulation** — click an empty slot to create; drag and resize event blocks.
- **Responsive** — the calendar is full-bleed at every size; the assistant is a translucent
  "ghost" overlay floating over it (collapsible), so it works on mobile and desktop.
- **Timeblocked + all-day events**, and **recurring events** (daily/weekly/monthly/yearly,
  expanded on read; single-occurrence edit/delete supported).
- **"Where I should be" presence layer** — a derived background colour behind the
  timeblocks. The baseline is **Home (Whitechapel)**. A non-home location event punches a
  trip out of that baseline: **30 min travel** out, time **at the location**, then 30 min
  travel back — after which presence returns home (no carry-forward). The time at a
  location defaults to the event's own duration but can be extended with a **stay duration**
  ("Cambridge for two days"), letting a trip span multiple days.
- **Multi-user** with Convex Auth (email + password).

## Architecture

| Layer | Where |
|---|---|
| Schema (data contract) | `convex/schema.ts` |
| Pure logic (time, recurrence, presence, bucketing) | `src/lib/*.ts` — unit-tested |
| Backend queries/mutations | `convex/{users,locations,events,commands}.ts` (+ `convex/model/`) |
| Anthropic tool-calling loop | `convex/agent.ts` (`"use node"` action) |
| Auth | `convex/auth.ts`, `middleware.ts`, `app/ConvexClientProvider.tsx` |
| Frontend | `app/`, `src/components/`, `src/hooks/` |

Time is stored as **UTC epoch ms + IANA timezone**; all-day events and recurrence
boundaries use **civil-date integers (YYYYMMDD)**. Presence is derived client-side from
the week's events, never stored. See `.claude/plans/full-stack-calendar-app-*.md` for the
full design.

## Setup

Prerequisites: [bun](https://bun.sh), an Anthropic API key, and a Convex account.

```bash
bun install                  # already done if you cloned with node_modules

# 1. Log in + create a Convex deployment. This writes NEXT_PUBLIC_CONVEX_URL to
#    .env.local and generates convex/_generated/ (required for typecheck/build).
bunx convex dev              # leave running in its own terminal

# 2. Configure Convex Auth (sets JWT keys + SITE_URL on the deployment).
bunx @convex-dev/auth

# 3. Give the agent action its API key (set on the Convex deployment, not .env.local).
bunx convex env set ANTHROPIC_API_KEY sk-ant-...

# 4. Run the Next.js dev server (separate terminal).
bun run dev                  # http://localhost:3000
```

> Steps 1–3 require your interactive login and cannot be scripted ahead of time. Until
> `convex dev` has run once, `convex/_generated/` does not exist, so `bun run typecheck`
> and `bun run build` will report missing-module errors on the generated imports — this is
> expected and resolves after step 1.

## Scripts

```bash
bun run dev          # Next.js dev server
bun run dev:backend  # convex dev (backend watch + codegen)
bun run test         # vitest — pure-logic unit tests (no deployment needed)
bun run typecheck    # tsc --noEmit (needs convex/_generated, i.e. after `convex dev`)
bun run build        # next build
```

## Tests

`bun run test` covers the tricky pure logic with no backend required:

- **presence** — home default, carry-forward, daily reset, overlapping setters, band merging
- **recurrence** — weekly `byWeekday`, intervals, `until`/`count`, DST wall-clock preservation
- **time** — civil↔epoch round trips, Monday-based week bounds, px↔minute, snapping
- **week** — timed vs all-day bucketing across the week
