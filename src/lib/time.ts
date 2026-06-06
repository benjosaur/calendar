import { DateTime } from "luxon";

/**
 * Time primitives shared across the client, Convex functions, and the agent action.
 *
 * Conventions:
 * - Timeblocked events are stored as UTC epoch milliseconds (`start`/`end`) plus an
 *   IANA `timezone` string describing the wall-clock zone the event was authored in.
 * - All-day events and recurrence boundaries use "civil date integers" of the form
 *   YYYYMMDD (e.g. 2026-06-04 -> 20260604). These are timezone-free and sortable.
 */

// ---------- Vertical time-grid scale ----------

/**
 * Visible vertical window of the day grid, in minutes from midnight. The grid
 * starts at 07:00 — the early-morning hours are off-screen by design so the whole
 * useful day fits a laptop screen without scrolling. The grid is laid out with
 * percentage heights that fill the available container, so there is no fixed
 * pixel scale; positions are expressed as a percentage of VISIBLE_MINUTES.
 */
export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 24 * 60; // 24:00
export const VISIBLE_MINUTES = DAY_END_MIN - DAY_START_MIN;

/** Snap granularity for drag/resize, in minutes. */
export const SNAP_MIN = 15;

/** Pixels per minute — retained only for legacy callers/tests; layout uses %. */
export const PX_PER_MINUTE = 0.9;

/** Convert "minutes from midnight" to a percentage offset within the visible grid. */
export function minutesToPct(minutesFromMidnight: number): number {
  const clamped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, minutesFromMidnight));
  return ((clamped - DAY_START_MIN) / VISIBLE_MINUTES) * 100;
}

/**
 * Convert a vertical pixel offset within a grid element of known total height to
 * "minutes from midnight". Used for drag/resize/click where we measure the live
 * element rect, so the math is independent of the (responsive) rendered height.
 */
export function offsetToMinutes(offsetPx: number, totalPx: number): number {
  if (totalPx <= 0) return DAY_START_MIN;
  return DAY_START_MIN + (offsetPx / totalPx) * VISIBLE_MINUTES;
}

/** Legacy px helpers (kept for tests); prefer minutesToPct/offsetToMinutes. */
export function minutesToPx(minutesFromMidnight: number): number {
  return (minutesFromMidnight - DAY_START_MIN) * PX_PER_MINUTE;
}
export function pxToMinutes(px: number): number {
  return px / PX_PER_MINUTE + DAY_START_MIN;
}

/** Snap a minute value to the nearest SNAP_MIN boundary, clamped to the visible window. */
export function snapMinutes(minutes: number, snap: number = SNAP_MIN): number {
  const snapped = Math.round(minutes / snap) * snap;
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, snapped));
}

// ---------- Civil date integers (YYYYMMDD) ----------

export function toCivil(dt: DateTime): number {
  return dt.year * 10000 + dt.month * 100 + dt.day;
}

export function fromCivilParts(civil: number): { y: number; m: number; d: number } {
  return {
    y: Math.floor(civil / 10000),
    m: Math.floor((civil % 10000) / 100),
    d: civil % 100,
  };
}

/** Build a Luxon DateTime at the start of the given civil date in a zone. */
export function civilToDateTime(civil: number, zone: string): DateTime {
  const { y, m, d } = fromCivilParts(civil);
  return DateTime.fromObject({ year: y, month: m, day: d }, { zone });
}

/** The civil date for a given UTC instant, observed in `zone`. */
export function civilForInstant(utcMs: number, zone: string): number {
  return toCivil(DateTime.fromMillis(utcMs, { zone }));
}

/** Today's civil date in a zone. */
export function civilToday(zone: string): number {
  return toCivil(DateTime.now().setZone(zone));
}

// ---------- Wall-clock <-> UTC ----------

/**
 * Combine a civil date + minutes-from-midnight, interpreted in `zone`, into a UTC
 * epoch ms instant. DST-correct: 09:00 on a given civil date is the local 09:00.
 */
export function wallToUtcMs(civil: number, minutesOfDay: number, zone: string): number {
  const { y, m, d } = fromCivilParts(civil);
  const dt = DateTime.fromObject(
    {
      year: y,
      month: m,
      day: d,
      hour: Math.floor(minutesOfDay / 60),
      minute: minutesOfDay % 60,
    },
    { zone },
  );
  return dt.toMillis();
}

/** Minutes from local midnight for a UTC instant, observed in `zone`. */
export function minutesOfDay(utcMs: number, zone: string): number {
  const dt = DateTime.fromMillis(utcMs, { zone });
  return dt.hour * 60 + dt.minute;
}

/**
 * The slice of a timed event that is visible on a single calendar day.
 *
 * A timed event can span days (e.g. Fri 14:00 -> Sun 15:00). For each day it
 * touches it renders a vertical band: the start day from its start minute to
 * midnight, whole intervening days top-to-bottom, and the end day from midnight
 * to its end minute. Returns `null` if the event does not overlap `civil`.
 *
 * `topMin`/`bottomMin` are minutes from local midnight (0..1440); callers feed
 * them to `minutesToPct` for layout. `isStart`/`isEnd` mark which edges belong
 * to this day so the renderer can place resize handles and round corners.
 *
 * Edge cases:
 * - An event ending at exact local midnight belongs to the previous day
 *   (its bottom edge is 24:00 there), not a zero-height sliver on the next day.
 * - A zero/negative-duration event falls back to filling to end of day, matching
 *   the historic single-day behaviour.
 */
export function eventDaySegment(
  start: number,
  end: number,
  civil: number,
  zone: string,
): { topMin: number; bottomMin: number; isStart: boolean; isEnd: boolean } | null {
  const startCivil = civilForInstant(start, zone);
  let endCivil = civilForInstant(end, zone);
  let endMin = minutesOfDay(end, zone);
  // An end at exact local midnight is the previous day's 24:00, not 00:00 today.
  if (endMin === 0 && end > start) {
    endCivil = civilForInstant(end - 1, zone);
    endMin = 24 * 60;
  }
  if (civil < startCivil || civil > endCivil) return null;

  const isStart = civil === startCivil;
  const isEnd = civil === endCivil;
  const topMin = isStart ? minutesOfDay(start, zone) : 0;
  let bottomMin = isEnd ? endMin : 24 * 60;
  // Degenerate same-day event with no positive duration: fill to end of day.
  if (isStart && isEnd && bottomMin <= topMin) bottomMin = 24 * 60;
  return { topMin, bottomMin, isStart, isEnd };
}

/**
 * Whether a timed event's [start, end) interval overlaps the half-open
 * window [fromMs, toMs). Use overlap — not "start falls inside the window" —
 * when fetching events to render, so a stay that begins in a prior week and
 * runs into the visible one is still included (the cross-week case).
 */
export function timedOverlapsWindow(
  start: number,
  end: number,
  fromMs: number,
  toMs: number,
): boolean {
  return start < toMs && end > fromMs;
}

/**
 * The end of a timed event's *footprint* in UTC ms — the later of its own end
 * and the end of its presence stay (`stayMinutes` from start). A location event
 * can have a short block but a multi-day `stayMinutes`, so the where-layer's
 * presence reaches past the block's end; use this (not the raw end) to decide
 * whether the event overlaps a visible window.
 */
export function timedEventEndMs(
  start: number,
  end: number | undefined,
  stayMinutes: number | undefined,
): number {
  const blockEnd = end ?? start;
  const stayEnd =
    stayMinutes !== undefined ? start + stayMinutes * 60_000 : blockEnd;
  return Math.max(blockEnd, stayEnd);
}

// ---------- Week boundaries (Monday-based) ----------

export interface WeekBounds {
  /** UTC ms at local 00:00 Monday. */
  weekStartMs: number;
  /** UTC ms at local 00:00 the following Monday (exclusive end). */
  weekEndMs: number;
  /** Civil date ints for the 7 days, index 0 = Monday .. 6 = Sunday. */
  dayCivils: number[];
  /** Luxon DateTime at local 00:00 for each of the 7 days. */
  days: DateTime[];
}

/**
 * Monday-based week containing `referenceMs` (or now), observed in `zone`.
 */
export function weekBounds(zone: string, referenceMs?: number): WeekBounds {
  const ref =
    referenceMs === undefined
      ? DateTime.now().setZone(zone)
      : DateTime.fromMillis(referenceMs, { zone });
  // Luxon: weekday 1 = Monday .. 7 = Sunday.
  const monday = ref.startOf("day").minus({ days: ref.weekday - 1 });
  const days: DateTime[] = [];
  const dayCivils: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = monday.plus({ days: i });
    days.push(day);
    dayCivils.push(toCivil(day));
  }
  const weekStartMs = monday.toMillis();
  const weekEndMs = monday.plus({ days: 7 }).toMillis();
  return { weekStartMs, weekEndMs, dayCivils, days };
}

/** Shift a reference instant by N weeks, returning the new reference ms. */
export function shiftWeeks(referenceMs: number, zone: string, deltaWeeks: number): number {
  return DateTime.fromMillis(referenceMs, { zone })
    .plus({ weeks: deltaWeeks })
    .toMillis();
}

// ---------- ISO helpers (used by the agent action) ----------

/** Parse an ISO 8601 string into UTC ms; throws on invalid input. */
export function isoToUtcMs(iso: string, fallbackZone: string): number {
  const dt = DateTime.fromISO(iso, { setZone: true, zone: fallbackZone });
  if (!dt.isValid) throw new Error(`Invalid ISO datetime: ${iso} (${dt.invalidReason})`);
  return dt.toMillis();
}

/** Parse a YYYY-MM-DD string into a civil int; throws on invalid input. */
export function isoDateToCivil(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${isoDate}`);
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/** Render a UTC instant as an ISO string in a zone (for LLM-facing output). */
export function utcMsToIso(utcMs: number, zone: string): string {
  return DateTime.fromMillis(utcMs, { zone }).toISO() ?? new Date(utcMs).toISOString();
}
