import type { AppState, CalendarEvent, Note } from "./types";
import { baseEventId, expandEventsInRange } from "./recurrence";

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

  // 事件提醒现在是 Settings 里的一个全局设置（defaultReminderOffset），不再是每个事件
  // 自己单独选——所有事件统一用这一个提前量，改了 Settings 立刻对所有事件生效。
  // -1 表示关闭事件提醒。
  const offset = state.settings.defaultReminderOffset;
  if (offset >= 0) {
    for (const ev of expandedEvents) {
      const start = new Date(ev.start);
      const at = new Date(start.getTime() - offset * 60_000);
      if (at >= now && at <= horizon) {
        out.push({
          id: `${ev.id}:${offset}`,
          at,
          title: ev.title,
          kind: "event",
          offsetLabel:
            offset === 0 ? "At start time" : `${offset >= 60 ? offset / 60 + " hr" : offset + " min"} before`,
          sourceId: baseEventId(ev.id),
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

/** Events whose [start, end] span touches this day at all — not just events that start on it. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  return events
    .filter((ev) => new Date(ev.start) <= dayEnd && new Date(ev.end) >= dayStart)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}

export function noteSnippet(note: Note, len = 120): string {
  const text = note.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > len ? text.slice(0, len) + "…" : text;
}
