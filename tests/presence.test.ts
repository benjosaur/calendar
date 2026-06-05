import { describe, it, expect } from "vitest";
import { derivePresenceBands } from "../src/lib/presence";
import type { Id, LocationLite, Occurrence } from "../src/lib/types";

const id = <T extends string>(s: string) => s as Id<T>;

const HOME = id<"locations">("loc_home");
const OFFICE = id<"locations">("loc_office");
const GYM = id<"locations">("loc_gym");

const locationsById: Record<string, LocationLite> = {
  [HOME]: { _id: HOME, name: "Home", color: "#6366f1", isHome: true },
  [OFFICE]: { _id: OFFICE, name: "Office", color: "#10b981", isHome: false },
  [GYM]: { _id: GYM, name: "Gym", color: "#f59e0b", isHome: false },
};

// Build a timed occurrence at given absolute ms with optional location/stay.
function occ(
  start: number,
  end: number,
  locationId?: Id<"locations">,
  stayMinutes?: number,
): Occurrence {
  return {
    occurrenceId: `o:${start}`,
    eventId: id<"events">("e"),
    occurrenceDate: 20260601,
    title: "x",
    allDay: false,
    start,
    end,
    timezone: "Europe/London",
    locationId,
    stayMinutes,
    isRecurring: false,
  };
}

const H = 3600_000;
const MIN = 60_000;
const DAY_START = 0;
const DAY_END = 24 * H;

// Shorthand to compare a band timeline as [fromHours, toHours, locationId|"travel"].
function shape(
  bands: { from: number; to: number; locationId: Id<"locations"> | null; name: string }[],
) {
  return bands.map((b) => [
    b.from / H,
    b.to / H,
    b.locationId ?? (b.name === "Travelling" ? "travel" : "home"),
  ]);
}

describe("derivePresenceBands (home baseline + travel/stay)", () => {
  it("no location events -> one full Home band", () => {
    const bands = derivePresenceBands({
      locationEvents: [],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: HOME,
      locationsById,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      from: DAY_START,
      to: DAY_END,
      locationId: HOME,
      name: "Home",
      color: "#6366f1",
    });
  });

  it("a non-home event adds 30-min travel before/after and returns to home (no carry-forward)", () => {
    // Office 12:00–13:00, default stay = event duration.
    const bands = derivePresenceBands({
      locationEvents: [occ(12 * H, 13 * H, OFFICE)],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: HOME,
      locationsById,
    });
    expect(shape(bands)).toEqual([
      [0, 11.5, HOME],
      [11.5, 12, "travel"], // 30 min travel out
      [12, 13, OFFICE],
      [13, 13.5, "travel"], // 30 min travel back
      [13.5, 24, HOME], // returns home — NOT carried to end of day
    ]);
  });

  it("home-tagged events contribute no trip (stay home)", () => {
    const bands = derivePresenceBands({
      locationEvents: [occ(9 * H, 10 * H, HOME)],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: HOME,
      locationsById,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0].locationId).toBe(HOME);
  });

  it("stayMinutes can span multiple days (fills an intermediate day fully)", () => {
    // Trip starts day 1 at 12:00 and lasts 48h -> day 2 (24h..48h) is all Office.
    const trip = [occ(12 * H, 13 * H, OFFICE, 48 * 60)];
    const day2 = derivePresenceBands({
      locationEvents: trip,
      dayStartMs: 24 * H,
      dayEndMs: 48 * H,
      homeLocationId: HOME,
      locationsById,
    });
    expect(day2).toHaveLength(1);
    expect(day2[0]).toMatchObject({ from: 24 * H, to: 48 * H, locationId: OFFICE });
  });

  it("travel buffer uses 30 minutes exactly", () => {
    const bands = derivePresenceBands({
      locationEvents: [occ(12 * H, 13 * H, OFFICE)],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: HOME,
      locationsById,
    });
    const travelOut = bands.find((b) => b.name === "Travelling")!;
    expect(travelOut.to - travelOut.from).toBe(30 * MIN);
    expect(travelOut.color).toBe("#f59e0b");
  });

  it("overlapping trips: later-starting trip wins in the overlap", () => {
    // Office 12:00 stay 4h (to 16:00); Gym 14:00 stay 1h (to 15:00) sits inside it.
    const bands = derivePresenceBands({
      locationEvents: [
        occ(12 * H, 13 * H, OFFICE, 4 * 60),
        occ(14 * H, 15 * H, GYM, 60),
      ],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: HOME,
      locationsById,
    });
    // At 14:00–15:00 Gym (later start) wins, then back to Office until 16:00.
    const labelled = shape(bands);
    expect(labelled).toContainEqual([14, 15, GYM]);
    expect(labelled).toContainEqual([15, 16, OFFICE]);
  });

  it("unknown home falls back to neutral colour", () => {
    const bands = derivePresenceBands({
      locationEvents: [],
      dayStartMs: DAY_START,
      dayEndMs: DAY_END,
      homeLocationId: undefined,
      locationsById,
    });
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ locationId: null, color: "#e5e7eb", name: "Home" });
  });
});
