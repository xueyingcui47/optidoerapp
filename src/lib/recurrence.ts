import type { CalendarEvent } from "./types";

const MS_DAY = 86_400_000;
// Safety cap so an "endless" recurring event can never generate unbounded occurrences
// even if a caller passes a huge date range.
const MAX_OCCURRENCES = 1000;

/** Synthetic occurrence ids look like "<baseId>::<index>" (index 0 = the original, never suffixed). */
export function baseEventId(occurrenceId: string): string {
  const i = occurrenceId.indexOf("::");
  return i < 0 ? occurrenceId : occurrenceId.slice(0, i);
}

/** The occurrence index encoded in a synthetic id (0 for the original/non-recurring event). */
export function occurrenceIndex(occurrenceId: string): number {
  const i = occurrenceId.indexOf("::");
  if (i < 0) return 0;
  const n = parseInt(occurrenceId.slice(i + 2), 10);
  return isNaN(n) ? 0 : n;
}

/** Steps forward `count` weekdays (Mon–Fri) from `base`, skipping weekends entirely. */
function addWeekdays(base: Date, count: number): Date {
  let d = new Date(base);
  let added = 0;
  while (added < count) {
    d = new Date(d.getTime() + MS_DAY);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function addMonthsClamped(d: Date, months: number): Date {
  const targetMonthIndex = d.getMonth() + months;
  const firstOfTarget = new Date(d.getFullYear(), targetMonthIndex, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const daysInTarget = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  firstOfTarget.setDate(Math.min(d.getDate(), daysInTarget));
  return firstOfTarget;
}

function occurrenceStart(base: Date, ev: CalendarEvent, index: number): Date {
  if (index === 0) return new Date(base);
  switch (ev.recurrence) {
    case "daily":
      return new Date(base.getTime() + index * MS_DAY);
    case "weekly":
      return new Date(base.getTime() + index * 7 * MS_DAY);
    case "weekdays":
      return addWeekdays(base, index);
    case "custom":
      return new Date(base.getTime() + index * (ev.customIntervalDays ?? 1) * MS_DAY);
    case "monthly":
      return addMonthsClamped(base, index);
    default:
      return new Date(base);
  }
}

/** Expand one event into its occurrences whose start falls within [rangeStart, rangeEnd]. */
export function expandOccurrences(ev: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  if (ev.recurrence === "none") {
    const touchesRange = new Date(ev.start) <= rangeEnd && new Date(ev.end) >= rangeStart;
    return touchesRange ? [ev] : [];
  }

  const baseStart = new Date(ev.start);
  const duration = new Date(ev.end).getTime() - baseStart.getTime();
  const maxCount = ev.recurrenceOccurrences ?? Infinity;
  const out: CalendarEvent[] = [];

  for (let i = 0; i < MAX_OCCURRENCES && i < maxCount; i++) {
    const start = occurrenceStart(baseStart, ev, i);
    if (start > rangeEnd) break;
    if (start >= rangeStart) {
      const end = new Date(start.getTime() + duration);
      out.push({
        ...ev,
        id: i === 0 ? ev.id : `${ev.id}::${i}`,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  }
  return out;
}

/** Expand every event in a list, within a date range, into their visible occurrences. */
export function expandEventsInRange(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ev of events) out.push(...expandOccurrences(ev, rangeStart, rangeEnd));
  return out;
}
