import type { Id, LocationLite, Occurrence, PresenceBand } from "./types";

/** Default travel buffer (minutes) before and after a non-home location event. */
export const TRAVEL_MIN = 30;
const MS_PER_MIN = 60_000;

/** Colours/labels for the non-location presence kinds. */
const TRAVEL_COLOR = "#f59e0b"; // amber
const HOME_FALLBACK_COLOR = "#e5e7eb";

interface Interval {
  from: number;
  to: number;
  kind: "location" | "travel";
  locationId: Id<"locations"> | null;
}

export interface DefaultPresenceInterval {
  from: number; // UTC ms
  to: number;   // UTC ms
  name: string;
  color: string;
}

export interface PresenceInput {
  /** All location-tagged TIMED occurrences in the visible week (home or not). */
  locationEvents: Occurrence[];
  /** Render window for this day, in UTC ms. */
  dayStartMs: number;
  dayEndMs: number;
  homeLocationId: Id<"locations"> | undefined;
  locationsById: Record<string, LocationLite>;
  /**
   * Default presence intervals that apply when no event-based interval covers the
   * time. Weaker than event bands (travel/location override them) but stronger than
   * the home baseline. Used for standing rules like "always at Westminster 9–18".
   */
  defaultIntervals?: DefaultPresenceInterval[];
}

/**
 * Intervals contributed by a single event. A non-home location event punches a
 * trip out of the home baseline: 30 min travel out, the stay at the location, then
 * 30 min travel back. The stay length defaults to the event's own duration but can
 * be overridden via `stayMinutes` (so a trip can span multiple days). Home-tagged
 * events contribute nothing — home is already the baseline.
 */
function tripIntervals(
  e: Occurrence,
  homeLocationId: Id<"locations"> | undefined,
): Interval[] {
  if (e.start === undefined || !e.locationId) return [];
  if (homeLocationId && e.locationId === homeLocationId) return [];

  const atStart = e.start;
  const stayMs =
    e.stayMinutes !== undefined
      ? e.stayMinutes * MS_PER_MIN
      : Math.max(0, (e.end ?? e.start) - e.start);
  const atEnd = atStart + stayMs;
  const travel = TRAVEL_MIN * MS_PER_MIN;

  return [
    { from: atStart - travel, to: atStart, kind: "travel", locationId: null },
    { from: atStart, to: atEnd, kind: "location", locationId: e.locationId },
    { from: atEnd, to: atEnd + travel, kind: "travel", locationId: null },
  ];
}

/**
 * Derive the presence (where-you-are) bands for one day column.
 *
 * Model: the day is "Home" by default. Each non-home location event overrides a
 * window with travel → at-location → travel. There is NO carry-forward to end of
 * day — presence returns to Home once a trip (plus its travel) ends. Where trips
 * overlap, an at-location interval beats travel, and the later-starting trip wins.
 *
 * Accepts the whole week's location events (not just this day's) so multi-day
 * stays correctly fill intermediate day columns.
 */
export function derivePresenceBands(input: PresenceInput): PresenceBand[] {
  const {
    locationEvents,
    dayStartMs,
    dayEndMs,
    homeLocationId,
    locationsById,
    defaultIntervals,
  } = input;

  const intervals = locationEvents.flatMap((e) =>
    tripIntervals(e, homeLocationId),
  );

  // Slice boundaries within the day: day edges plus any interval edge inside it.
  const points = new Set<number>([dayStartMs, dayEndMs]);
  for (const iv of intervals) {
    if (iv.from > dayStartMs && iv.from < dayEndMs) points.add(iv.from);
    if (iv.to > dayStartMs && iv.to < dayEndMs) points.add(iv.to);
  }
  for (const d of (defaultIntervals ?? [])) {
    if (d.from > dayStartMs && d.from < dayEndMs) points.add(d.from);
    if (d.to > dayStartMs && d.to < dayEndMs) points.add(d.to);
  }
  const sorted = [...points].sort((a, b) => a - b);

  type Seg = {
    from: number;
    to: number;
    kind: "home" | "location" | "travel" | "default";
    locationId: Id<"locations"> | null;
    defaultName?: string;
    defaultColor?: string;
  };
  const raw: Seg[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const mid = (from + to) / 2;

    // Winning interval at the slice midpoint: location beats travel; among
    // same-kind overlaps, the later-starting one wins.
    let loc: Interval | undefined;
    let trav: Interval | undefined;
    for (const iv of intervals) {
      if (mid < iv.from || mid >= iv.to) continue;
      if (iv.kind === "location") {
        if (!loc || iv.from > loc.from) loc = iv;
      } else if (!trav || iv.from > trav.from) {
        trav = iv;
      }
    }

    if (loc) raw.push({ from, to, kind: "location", locationId: loc.locationId });
    else if (trav) raw.push({ from, to, kind: "travel", locationId: null });
    else {
      const def = defaultIntervals?.find((d) => mid >= d.from && mid < d.to);
      if (def) {
        raw.push({ from, to, kind: "default", locationId: null, defaultName: def.name, defaultColor: def.color });
      } else {
        raw.push({ from, to, kind: "home", locationId: homeLocationId ?? null });
      }
    }
  }

  // Merge adjacent slices of the same kind + location (+ name for default bands).
  const merged: Seg[] = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === seg.kind &&
      prev.locationId === seg.locationId &&
      prev.defaultName === seg.defaultName
    ) {
      prev.to = seg.to;
    } else {
      merged.push({ ...seg });
    }
  }

  // Resolve colour + display name per band.
  return merged.map((seg): PresenceBand => {
    if (seg.kind === "travel") {
      return {
        from: seg.from,
        to: seg.to,
        locationId: null,
        kind: "travel",
        color: TRAVEL_COLOR,
        name: "Travelling",
      };
    }
    if (seg.kind === "default") {
      return {
        from: seg.from,
        to: seg.to,
        locationId: null,
        kind: "location",
        color: seg.defaultColor!,
        name: seg.defaultName!,
      };
    }
    const loc = seg.locationId ? locationsById[seg.locationId] : undefined;
    return {
      from: seg.from,
      to: seg.to,
      locationId: seg.locationId,
      kind: seg.kind,
      color: loc?.color ?? HOME_FALLBACK_COLOR,
      name: loc?.name ?? (seg.kind === "home" ? "Home" : "Unknown"),
    };
  });
}
