"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { LocationLite, Occurrence, Recurrence } from "@/lib/types";
import { fromCivilParts, isoDateToCivil } from "@/lib/time";

type Mode = "create" | "edit";

/**
 * Dialog state driven by the calendar page: closed, creating at a clicked slot,
 * or editing an existing occurrence.
 */
export type EventDialogState =
  | { mode: "closed" }
  | { mode: "create"; civil: number; startMinutes?: number }
  | { mode: "edit"; occurrence: Occurrence };

interface EventDialogProps {
  state: EventDialogState;
  locations: LocationLite[];
  tz: string;
  onClose: () => void;
  /** Switch the calendar to the week of the saved event's start. */
  onNavigate?: (ms: number) => void;
}

/** Weekday labels, index 0 = Monday .. 6 = Sunday (matches Recurrence.byWeekday). */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FREQS: Recurrence["freq"][] = ["daily", "weekly", "monthly", "yearly"];

// ---------- luxon <-> input-string helpers (all in the supplied tz) ----------

/** A UTC instant -> "yyyy-MM-ddTHH:mm" for a <input type=datetime-local>. */
function msToLocalInput(ms: number, tz: string): string {
  return DateTime.fromMillis(ms, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** "yyyy-MM-ddTHH:mm" wall-clock in tz -> UTC ms. */
function localInputToMs(value: string, tz: string): number {
  return DateTime.fromISO(value, { zone: tz }).toMillis();
}

/** Civil int (YYYYMMDD) -> "yyyy-MM-dd" for a <input type=date>. */
function civilToDateInput(civil: number): string {
  const { y, m, d } = fromCivilParts(civil);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function EventDialog({
  state,
  locations,
  tz,
  onClose,
  onNavigate,
}: EventDialogProps) {
  const open = state.mode !== "closed";
  const mode: Mode = state.mode === "edit" ? "edit" : "create";

  // Normalise the page's state union into the seed values the form reads.
  // Memoised so the reset effect only re-runs when the dialog target changes.
  const initial = useMemo<
    (Partial<Occurrence> & { startMin?: number; civil?: number }) | undefined
  >(() => {
    if (state.mode === "edit") return state.occurrence;
    if (state.mode === "create") return { civil: state.civil, startMin: state.startMinutes };
    return undefined;
  }, [state]);
  const createEvent = useMutation(api.events.createEvent);
  const updateEvent = useMutation(api.events.updateEvent);
  const editOccurrence = useMutation(api.events.editOccurrence);
  const deleteEvent = useMutation(api.events.deleteEvent);
  const cancelOccurrence = useMutation(api.events.cancelOccurrence);

  // Whether this dialog targets a single instance of a recurring master.
  const isRecurringInstance = mode === "edit" && Boolean(initial?.masterId);

  // ---- form state ----
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startStr, setStartStr] = useState(""); // datetime-local (timed)
  const [endStr, setEndStr] = useState("");
  const [startDateStr, setStartDateStr] = useState(""); // date (all-day)
  const [endDateStr, setEndDateStr] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState<string>(""); // "" = none, "__new" = free text
  const [locationName, setLocationName] = useState("");
  // Optional presence stay length, in hours (blank = use the event's own duration).
  const [stayHours, setStayHours] = useState("");
  // Apply edits to "this" instance vs the whole series.
  const [scope, setScope] = useState<"this" | "all">("this");
  // Recurrence (create / edit-all only).
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<Recurrence["freq"]>("weekly");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurWeekdays, setRecurWeekdays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  // Reset form from `initial` whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const isAllDay = initial?.allDay ?? false;
    setTitle(initial?.title ?? "");
    setAllDay(isAllDay);
    setDescription(initial?.description ?? "");
    setScope("this");

    // Seed a sensible default slot for create from a clicked cell.
    const seedCivil = initial?.civil ?? Number(DateTime.now().setZone(tz).toFormat("yyyyMMdd"));
    const seedStartMin = initial?.startMin ?? 9 * 60;

    if (isAllDay) {
      const sd = initial?.startDate ?? seedCivil;
      const ed = initial?.endDate ?? sd;
      setStartDateStr(civilToDateInput(sd));
      setEndDateStr(civilToDateInput(ed));
      setStartStr("");
      setEndStr("");
    } else {
      let startMs = initial?.start;
      let endMs = initial?.end;
      if (startMs === undefined) {
        const { y, m, d } = fromCivilParts(seedCivil);
        startMs = DateTime.fromObject(
          { year: y, month: m, day: d, hour: Math.floor(seedStartMin / 60), minute: seedStartMin % 60 },
          { zone: tz },
        ).toMillis();
      }
      if (endMs === undefined) endMs = startMs + 60 * 60 * 1000; // default 1h
      setStartStr(msToLocalInput(startMs, tz));
      setEndStr(msToLocalInput(endMs, tz));
      setStartDateStr("");
      setEndDateStr("");
    }

    // Location seed.
    if (initial?.locationId) {
      setLocationId(initial.locationId as string);
      setLocationName("");
    } else {
      setLocationId("");
      setLocationName("");
    }
    setStayHours(
      initial?.stayMinutes !== undefined ? String(initial.stayMinutes / 60) : "",
    );

    // Recurrence seed (only meaningful on the master).
    const rec = (initial as { recurrence?: Recurrence } | undefined)?.recurrence;
    if (rec) {
      setRecurEnabled(true);
      setRecurFreq(rec.freq);
      setRecurInterval(rec.interval);
      setRecurWeekdays(rec.byWeekday ?? []);
    } else {
      setRecurEnabled(false);
      setRecurFreq("weekly");
      setRecurInterval(1);
      setRecurWeekdays([]);
    }
  }, [open, initial, tz]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const targetId = (initial?.masterId ?? initial?.eventId) as Id<"events"> | undefined;

  // Build the recurrence object from form state (undefined if disabled).
  const recurrence = useMemo<Recurrence | undefined>(() => {
    if (!recurEnabled) return undefined;
    const r: Recurrence = { freq: recurFreq, interval: Math.max(1, recurInterval) };
    if (recurFreq === "weekly" && recurWeekdays.length > 0) {
      r.byWeekday = [...recurWeekdays].sort((a, b) => a - b);
    }
    return r;
  }, [recurEnabled, recurFreq, recurInterval, recurWeekdays]);

  if (!open) return null;

  function toggleWeekday(day: number) {
    setRecurWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  /** Resolve location form state into the args shared by create/update. */
  function locationArgs(): { locationId?: Id<"locations">; locationName?: string } {
    if (locationId === "__new" && locationName.trim()) {
      return { locationName: locationName.trim() };
    }
    if (locationId && locationId !== "__new") {
      return { locationId: locationId as Id<"locations"> };
    }
    return {};
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const loc = locationArgs();
      // Optional stay length (hours → minutes); only meaningful for timed events.
      const parsedStay = Number(stayHours);
      const stayMinutes =
        !allDay && stayHours.trim() && Number.isFinite(parsedStay) && parsedStay > 0
          ? Math.round(parsedStay * 60)
          : undefined;

      // The saved event's start instant — used to switch to its week on save.
      const navMs = allDay
        ? DateTime.fromISO(startDateStr, { zone: tz }).toMillis()
        : localInputToMs(startStr, tz);
      const navigate = () => {
        if (Number.isFinite(navMs)) onNavigate?.(navMs);
      };

      if (mode === "create") {
        if (allDay) {
          await createEvent({
            title: title.trim(),
            allDay: true,
            timezone: tz,
            startDate: isoDateToCivil(startDateStr),
            endDate: isoDateToCivil(endDateStr || startDateStr),
            description: description.trim() || undefined,
            recurrence,
            ...loc,
          });
        } else {
          await createEvent({
            title: title.trim(),
            allDay: false,
            timezone: tz,
            start: localInputToMs(startStr, tz),
            end: localInputToMs(endStr, tz),
            description: description.trim() || undefined,
            recurrence,
            stayMinutes,
            ...loc,
          });
        }
        navigate();
        onClose();
        return;
      }

      // ---- edit ----
      if (!targetId) {
        onClose();
        return;
      }

      // Editing a single instance of a recurring series.
      if (isRecurringInstance && scope === "this" && initial?.occurrenceDate !== undefined) {
        const override: {
          title?: string;
          start?: number;
          end?: number;
          locationId?: Id<"locations"> | null;
        } = {};
        if (title.trim()) override.title = title.trim();
        if (!allDay) {
          override.start = localInputToMs(startStr, tz);
          override.end = localInputToMs(endStr, tz);
        }
        // Explicit location choice (including clearing to none).
        if (loc.locationId) override.locationId = loc.locationId;
        else if (locationId === "") override.locationId = null;
        await editOccurrence({
          masterId: initial.masterId as Id<"events">,
          occurrenceDate: initial.occurrenceDate,
          override,
        });
        navigate();
        onClose();
        return;
      }

      // Whole-event / whole-series update.
      const patch: {
        title?: string;
        description?: string;
        allDay?: boolean;
        start?: number;
        end?: number;
        startDate?: number;
        endDate?: number;
        locationId?: Id<"locations"> | null;
        stayMinutes?: number | null;
        recurrence?: Recurrence | null;
      } = {
        title: title.trim(),
        description: description.trim() || undefined,
        allDay,
        locationId: loc.locationId ?? null,
        stayMinutes: stayMinutes ?? null,
        recurrence: recurrence ?? null,
      };
      if (allDay) {
        patch.startDate = isoDateToCivil(startDateStr);
        patch.endDate = isoDateToCivil(endDateStr || startDateStr);
      } else {
        patch.start = localInputToMs(startStr, tz);
        patch.end = localInputToMs(endStr, tz);
      }
      await updateEvent({ id: targetId, patch });
      navigate();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy || !targetId) return;
    setBusy(true);
    try {
      if (isRecurringInstance && initial?.occurrenceDate !== undefined) {
        await cancelOccurrence({
          masterId: initial.masterId as Id<"events">,
          occurrenceDate: initial.occurrenceDate,
        });
      } else {
        await deleteEvent({ id: targetId });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // When editing a single recurring instance, recurrence + all-day toggles are
  // series-level and hidden (overrides only carry title/time/location).
  const showSeriesFields = !(isRecurringInstance && scope === "this");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Create event" : "Edit event"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSave}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">
          {mode === "create" ? "New event" : "Edit event"}
        </h2>

        {/* Recurring-instance scope choice */}
        {isRecurringInstance && (
          <fieldset className="mb-4 rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs font-medium text-neutral-500">
              Apply to
            </legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "this"}
                  onChange={() => setScope("this")}
                />
                This event
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All events
              </label>
            </div>
          </fieldset>
        )}

        {/* Title */}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Title</span>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {/* All-day toggle (series-level) */}
        {showSeriesFields && (
          <label className="mb-3 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>
        )}

        {/* Time / date inputs */}
        {allDay ? (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Start</span>
              <input
                type="date"
                required
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">End</span>
              <input
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </label>
          </div>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Start</span>
              <input
                type="datetime-local"
                required
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">End</span>
              <input
                type="datetime-local"
                required
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </label>
          </div>
        )}

        {/* Location */}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Location</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">None</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id as string}>
                {loc.name}
              </option>
            ))}
            <option value="__new">New location…</option>
          </select>
        </label>
        {locationId === "__new" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">
              New location name
            </span>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. The cafe"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        )}

        {/* Stay duration (timed events with a location only) */}
        {!allDay && locationId !== "" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">
              Time at location (hours, optional)
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={stayHours}
              onChange={(e) => setStayHours(e.target.value)}
              placeholder="defaults to event length — e.g. 48 for two days"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="mt-1 block text-[11px] text-neutral-400">
              30 min travel each way is added automatically.
            </span>
          </label>
        )}

        {/* Description */}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {/* Recurrence (series-level only) */}
        {showSeriesFields && (
          <fieldset className="mb-4 rounded-md border border-neutral-200 p-3">
            <legend className="px-1">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                <input
                  type="checkbox"
                  checked={recurEnabled}
                  onChange={(e) => setRecurEnabled(e.target.checked)}
                />
                Repeats
              </label>
            </legend>
            {recurEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span>Every</span>
                  <input
                    type="number"
                    min={1}
                    value={recurInterval}
                    onChange={(e) => setRecurInterval(Number(e.target.value) || 1)}
                    className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <select
                    value={recurFreq}
                    onChange={(e) => setRecurFreq(e.target.value as Recurrence["freq"])}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  >
                    {FREQS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                {recurFreq === "weekly" && (
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={recurWeekdays.includes(day)}
                        onClick={() => toggleWeekday(day)}
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          recurWeekdays.includes(day)
                            ? "bg-indigo-600 text-white"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </fieldset>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between">
          {mode === "edit" ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
