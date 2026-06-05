# Calendar app — build plan & review

## Plan
- [x] Scaffold project (Next.js 15 + Convex + Tailwind v4, bun), configs, deps
- [x] Contract files: `convex/schema.ts`, `src/lib/time.ts`, `src/lib/types.ts`
- [x] Pure logic libs + unit tests: `recurrence`, `presence`, `week` (23 tests green)
- [x] Convex backend: auth, users, locations, events (+ model/), commands
- [x] Anthropic tool-calling action: `convex/agent.ts`
- [x] Frontend: app shell, auth/signin, week grid (5-over-2), presence background,
      drag/resize, all-day row, command bar + feed, event dialog, legend
- [ ] **User step:** `bunx convex dev` (login → generates `convex/_generated`, sets URL)
- [ ] **User step:** `bunx @convex-dev/auth` (auth keys)
- [ ] **User step:** `bunx convex env set ANTHROPIC_API_KEY ...`
- [ ] **User step:** `bun run dev`, then `bun run typecheck` (needs `_generated`)

## Review

**Built via a 7-agent dynamic workflow** (4 backend/libs in parallel, then 3 frontend),
all against fixed contract files so the parallel output stayed consistent.

**Verified:**
- 23/23 pure-logic unit tests pass (presence carry-forward, DST-correct recurrence across
  the 2026-10-25 UK change, week bucketing).
- Reviewed integration seams: page ↔ WeekGrid ↔ DayColumn ↔ EventDialog props align;
  z-layering (presence z-0, click z-10, blocks z-20) correct; middleware + auth use current
  `@convex-dev/auth` APIs.

**Bug found & fixed during review:**
- `convex/agent.ts` called `internal.locations.setHome`, but `setHome` was only a public
  mutation. Extracted `setHomeForUser` into `convex/model/locations.ts` and added an
  internal twin `setHomeInternal`; updated the agent call.

**Known limitations / not verified (require Convex login):**
- Full `tsc` typecheck and `next build` need `convex/_generated`, created by `convex dev`.
- The live LLM loop and drag/resize were not exercised end-to-end (no running deployment).

## Verification prompts (after bring-up)
- "schedule lunch with Sarah at noon tomorrow at the cafe" → timed event tomorrow 12:00,
  "The Cafe" location created, presence band turns cafe-colour from noon.
- "move my 3pm to 4pm" → agent calls query_events then move_event; grid updates live.
- "what's my Friday look like" → query_events + summary in the feed, no mutation.
