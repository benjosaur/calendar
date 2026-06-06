import { useEffect, useState } from "react";

/**
 * The current instant (UTC ms), re-rendered on a fixed cadence so time-of-day
 * UI — like the calendar's "now" line and today highlight — stays live without a
 * page reload. Defaults to a one-minute tick, which matches the grid's
 * minute-level resolution; pass a smaller interval only if you need finer motion.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
