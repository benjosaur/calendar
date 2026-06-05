/**
 * Branded id type, structurally identical to Convex's generated `Id<T>`
 * (`string & { __tableName: T }`), so values flow both ways without casts while
 * keeping this module independent of `convex/_generated` (which only exists after
 * `convex dev`). This lets the pure libs typecheck and unit-test offline.
 */
export type Id<T extends string> = string & { __tableName: T };

/** Recurrence rule stored on a master event. */
export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  /** Every N units. */
  interval: number;
  /** For weekly rules: 0 = Monday .. 6 = Sunday. */
  byWeekday?: number[];
  /** Civil-date int (YYYYMMDD), inclusive. Undefined = forever. */
  until?: number;
  /** Alternative cap on the number of occurrences. */
  count?: number;
}

/** A location with a colour, used for the presence layer. */
export interface LocationLite {
  _id: Id<"locations">;
  name: string;
  color: string;
  isHome: boolean;
}

/**
 * A single concrete occurrence for the visible week, returned by `eventsForWeek`.
 * For recurring instances `occurrenceId` is the synthetic stable key
 * `${masterId}:${occurrenceDate}`; for one-offs it is the real document id.
 */
export interface Occurrence {
  /** Stable key for React + edit targeting. */
  occurrenceId: string;
  /** Underlying document id (the master for recurring instances). */
  eventId: Id<"events">;
  /** Present iff this is a recurring instance. */
  masterId?: Id<"events">;
  /** Civil date of this occurrence (YYYYMMDD), used to target a single instance. */
  occurrenceDate: number;

  title: string;
  description?: string;
  allDay: boolean;

  /** UTC ms (timeblocked events only). */
  start?: number;
  end?: number;
  timezone: string;

  /** Civil-date ints (all-day events only). */
  startDate?: number;
  endDate?: number;

  locationId?: Id<"locations">;
  /**
   * Optional: how long (minutes) you remain at this event's location for presence
   * purposes. Defaults to the event's own duration. Lets a trip span multiple days
   * (e.g. "Cambridge for two days") independent of the event block's length.
   */
  stayMinutes?: number;
  isRecurring: boolean;
}

/** A derived presence background band within a single day column. */
export interface PresenceBand {
  /** UTC ms range the band covers. */
  from: number;
  to: number;
  locationId: Id<"locations"> | null;
  /** What the band represents — drives how prominently it renders. */
  kind: "home" | "location" | "travel";
  /** Resolved colour (falls back to a neutral tone when location is unknown). */
  color: string;
  /** Resolved display name for the legend/tooltip. */
  name: string;
}
