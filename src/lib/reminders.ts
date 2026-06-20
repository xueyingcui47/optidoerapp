import type { AppState, CalendarEvent, Note } from "./types";
import { expandEventsInRange } from "./recurrence";

export interface ReminderInstance {
  id: string;
  at: Date;
  title: string;
  kind: "event" | "note";
  offsetLabel: string;
  sourceId: string;
}

/** 从事件提醒 + 笔记提醒，汇总出未来的提醒实例并按时间排序。 */
export function upcomingReminders(state: AppState, horizonDays = 30): ReminderInstance[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: ReminderInstance[] = [];

  // Widen the expansion window by a day past the horizon so reminders set "1 day before"
  // on an occurrence that starts just past the horizon still get picked up.
  const expandEnd = new Date(horizon.getTime() + 86_400_000);
  const expandedEvents = expandEventsInRange(state.events, now, expandEnd);

  for (const ev of expandedEvents) {
    const start = new Date(ev.start);
    for (const offset of ev.reminders) {
      const at = new Date(start.getTime() - offset * 60_000);
      if (at >= now && at <= horizon) {
        out.push({
          id: `${ev.id}:${offset}`,
          at,
          title: ev.title,
          kind: "event",
          offsetLabel:
            offset === 0 ? "At start time" : `${offset >= 60 ? offset / 60 + " hr" : offset + " min"} before`,
          sourceId: ev.id,
        });
      }
    }
  }

  for (const note of state.notes) {
    if (note.reminderAt) {
      const at = new Date(note.reminderAt);
      if (at >= now && at <= horizon) {
        out.push({
          id: `note:${note.id}`,
          at,
          title: note.title || "(untitled note)",
          kind: "note",
          offsetLabel: "Note reminder",
          sourceId: note.id,
        });
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const y = day.getFullYear();
  const m = day.getMonth();
  const d = day.getDate();
  return events
    .filter((ev) => {
      const s = new Date(ev.start);
      return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
    })
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}

export function noteSnippet(note: Note, len = 120): string {
  const text = note.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > len ? text.slice(0, len) + "…" : text;
}
