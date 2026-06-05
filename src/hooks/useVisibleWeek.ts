import { useCallback, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { weekBounds, shiftWeeks } from "@/lib/time";

export interface VisibleWeek {
  tz: string;
  /** Reference instant whose Monday-week is currently shown. */
  referenceMs: number;
  weekStartMs: number;
  weekEndMs: number;
  /** Civil date ints, index 0 = Monday .. 6 = Sunday. */
  dayCivils: number[];
  /** Luxon DateTime at local 00:00 for each of the 7 days. */
  days: DateTime[];
  prev: () => void;
  next: () => void;
  today: () => void;
  /** Jump to the week containing the given UTC instant. */
  goToMs: (ms: number) => void;
  /** Human label, e.g. "2 Jun – 8 Jun 2026". */
  label: string;
}

/** Manages the visible Monday-based week + timezone for the calendar screen. */
export function useVisibleWeek(): VisibleWeek {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const [referenceMs, setReferenceMs] = useState<number>(() => Date.now());

  const bounds = useMemo(() => weekBounds(tz, referenceMs), [tz, referenceMs]);

  const prev = useCallback(
    () => setReferenceMs((ms) => shiftWeeks(ms, tz, -1)),
    [tz],
  );
  const next = useCallback(
    () => setReferenceMs((ms) => shiftWeeks(ms, tz, 1)),
    [tz],
  );
  const today = useCallback(() => setReferenceMs(Date.now()), []);
  const goToMs = useCallback((ms: number) => setReferenceMs(ms), []);

  const label = useMemo(() => {
    const [first, last] = [bounds.days[0], bounds.days[6]];
    const sameYear = first.year === last.year;
    const start = first.toFormat(sameYear ? "d LLL" : "d LLL yyyy");
    const end = last.toFormat("d LLL yyyy");
    return `${start} – ${end}`;
  }, [bounds.days]);

  return {
    tz,
    referenceMs,
    weekStartMs: bounds.weekStartMs,
    weekEndMs: bounds.weekEndMs,
    dayCivils: bounds.dayCivils,
    days: bounds.days,
    prev,
    next,
    today,
    goToMs,
    label,
  };
}
