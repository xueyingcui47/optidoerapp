"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { EventEditor } from "@/components/calendar/EventEditor";
import { eventsOnDay } from "@/lib/reminders";
import {
  addDays,
  addMonths,
  fmtMonthYear,
  fmtTime,
  isToday,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/date";
import type { CalendarEvent } from "@/lib/types";
import { eventBlockClasses, eventPillClasses } from "@/lib/eventColors";
import { baseEventId, expandEventsInRange, occurrenceIndex } from "@/lib/recurrence";

type View = "month" | "week" | "day";
type Draft = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function newDraft(start: Date): Draft {
  const s = new Date(start);
  if (s.getHours() === 0 && s.getMinutes() === 0) s.setHours(9, 0, 0, 0);
  const e = new Date(s.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    location: "",
    description: "",
    start: s.toISOString(),
    end: e.toISOString(),
    allDay: false,
    completed: false,
    recurrence: "none",
    reminders: [10],
    source: "manual",
  };
}

export default function CalendarPage() {
  const { state } = useStore();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [editor, setEditor] = useState<{ initial: Draft; id: string | null; occurrenceIndex: number } | null>(null);

  const openNew = (start: Date) => setEditor({ initial: newDraft(start), id: null, occurrenceIndex: 0 });
  const openEdit = (ev: CalendarEvent) => {
    // Recurring occurrences carry a synthetic id ("<id>::<n>") — editing always shows/saves
    // the original series' fields, but deleting needs to know which occurrence was clicked
    // so it can offer "this and following" vs. "entire series".
    const realId = baseEventId(ev.id);
    const base = state.events.find((e) => e.id === realId) ?? ev;
    setEditor({ initial: { ...base }, id: base.id, occurrenceIndex: occurrenceIndex(ev.id) });
  };

  const visibleRange = useMemo(() => {
    if (view === "month") {
      const gridStart = startOfWeek(startOfMonth(cursor));
      return { start: gridStart, end: new Date(addDays(gridStart, 42).getTime() - 1) };
    }
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { start: s, end: new Date(addDays(s, 7).getTime() - 1) };
    }
    const s = startOfDay(cursor);
    return { start: s, end: new Date(addDays(s, 1).getTime() - 1) };
  }, [view, cursor]);

  const visibleEvents = useMemo(
    () => expandEventsInRange(state.events, visibleRange.start, visibleRange.end),
    [state.events, visibleRange]
  );

  const move = (dir: number) => {
    if (view === "month") setCursor(addMonths(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  const title =
    view === "month"
      ? fmtMonthYear(cursor)
      : view === "week"
      ? `${fmtMonthYear(startOfWeek(cursor))} · Week ${weekNum(cursor)}`
      : cursor.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        });

  return (
    <div className="h-full flex flex-col">
      <header className="flex flex-wrap items-center gap-2 justify-between px-3 sm:px-5 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => move(-1)} className="navbtn shrink-0">
            ‹
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 shrink-0"
          >
            Today
          </button>
          <button onClick={() => move(1)} className="navbtn shrink-0">
            ›
          </button>
          <h1 className="ml-1 text-sm sm:text-lg font-semibold text-slate-800 truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 sm:px-3 py-1 rounded-md ${
                  view === v ? "bg-brand-600 text-white" : "text-slate-600"
                }`}
              >
                {{ month: "Month", week: "Week", day: "Day" }[v]}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNew(view === "month" ? new Date() : cursor)}
            className="text-sm bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 whitespace-nowrap"
          >
            <span className="sm:hidden">＋ New</span>
            <span className="hidden sm:inline">＋ New / AI create</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50">
        {view === "month" && (
          <MonthGrid
            cursor={cursor}
            events={visibleEvents}
            onDayClick={openNew}
            onEventClick={openEdit}
          />
        )}
        {view === "week" && (
          <TimeGrid
            days={weekDays(cursor)}
            events={visibleEvents}
            onSlotClick={openNew}
            onEventClick={openEdit}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[new Date(cursor)]}
            events={visibleEvents}
            onSlotClick={openNew}
            onEventClick={openEdit}
          />
        )}
      </div>

      {editor && (
        <EventEditor
          initial={editor.initial}
          editingId={editor.id}
          occurrenceIndex={editor.occurrenceIndex}
          onClose={() => setEditor(null)}
        />
      )}

      <style jsx>{`
        :global(.navbtn) {
          width: 2rem;
          height: 2rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          font-size: 1.1rem;
          line-height: 1;
        }
        :global(.navbtn:hover) {
          background: rgb(241 245 249);
        }
      `}</style>
    </div>
  );
}

function weekNum(d: Date): number {
  const first = startOfMonth(d);
  return Math.ceil((d.getDate() + ((first.getDay() + 6) % 7)) / 7);
}

function weekDays(cursor: Date): Date[] {
  const s = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/* ───────────────── 月视图 ───────────────── */
function MonthGrid({
  cursor,
  events,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  return (
    <div className="grid grid-cols-7 border-l border-t border-slate-200 bg-white">
      {WEEK_LABELS.map((w) => (
        <div
          key={w}
          className="text-center text-xs text-slate-500 py-2 border-r border-b border-slate-200 bg-slate-50"
        >
          {w}
        </div>
      ))}
      {cells.map((day, i) => {
        const inMonth = day.getMonth() === cursor.getMonth();
        const dayEvents = eventsOnDay(events, day);
        return (
          <div
            key={i}
            onClick={() => onDayClick(day)}
            className={`min-h-[64px] sm:min-h-[96px] border-r border-b border-slate-200 p-0.5 sm:p-1 cursor-pointer hover:bg-slate-50 ${
              inMonth ? "" : "bg-slate-50/60"
            }`}
          >
            <div
              className={`text-xs mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                isToday(day)
                  ? "bg-brand-600 text-white"
                  : inMonth
                  ? "text-slate-700"
                  : "text-slate-400"
              }`}
            >
              {day.getDate()}
            </div>
            <div className="space-y-0.5">
              {dayEvents.slice(0, 3).map((ev) => (
                <button
                  key={ev.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(ev);
                  }}
                  className={`block w-full text-left truncate text-[11px] rounded px-1 py-0.5 ${eventPillClasses(ev)}`}
                >
                  {!ev.allDay && <span className="opacity-70 mr-1">{fmtTime(new Date(ev.start))}</span>}
                  {ev.title || "(untitled)"}
                </button>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-slate-400 px-1">+{dayEvents.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────── 周/日视图（时间网格） ───────────────── */
function TimeGrid({
  days,
  events,
  onSlotClick,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSlotClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const HOUR_PX = 48;

  return (
    <div className="bg-white">
      {/* 头部日期 */}
      <div className="grid sticky top-0 z-10 bg-white border-b border-slate-200" style={cols(days.length)}>
        <div className="border-r border-slate-200" />
        {days.map((d, i) => (
          <div key={i} className="text-center py-2 border-r border-slate-200">
            <div className="text-xs text-slate-500">{WEEK_LABELS[(d.getDay() + 6) % 7]}</div>
            <div
              className={`text-sm inline-flex items-center justify-center w-7 h-7 rounded-full ${
                isToday(d) ? "bg-brand-600 text-white" : "text-slate-700"
              }`}
            >
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* 时间网格 */}
      <div className="grid" style={cols(days.length)}>
        {/* 小时刻度 */}
        <div className="border-r border-slate-200">
          {hours.map((h) => (
            <div key={h} className="text-[10px] text-slate-400 text-right pr-1" style={{ height: HOUR_PX }}>
              {h}:00
            </div>
          ))}
        </div>

        {days.map((day, di) => {
          const dayEvents = eventsOnDay(events, day).filter((e) => !e.allDay);
          return (
            <div key={di} className="relative border-r border-slate-200">
              {hours.map((h) => (
                <div
                  key={h}
                  onClick={() => {
                    const d = new Date(day);
                    d.setHours(h, 0, 0, 0);
                    onSlotClick(d);
                  }}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {dayEvents.map((ev) => {
                // Clip multi-day events to just this day's portion, so each day shows
                // (and positions) only the slice of the event that actually falls on it.
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                const dayEnd = new Date(dayStart.getTime() + 86_400_000);
                const s = new Date(Math.max(new Date(ev.start).getTime(), dayStart.getTime()));
                const e = new Date(Math.min(new Date(ev.end).getTime(), dayEnd.getTime()));
                const top = (s.getHours() + s.getMinutes() / 60) * HOUR_PX;
                const height = Math.max(
                  18,
                  ((e.getTime() - s.getTime()) / 3_600_000) * HOUR_PX
                );
                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className={`absolute left-1 right-1 rounded text-[11px] px-1 py-0.5 text-left overflow-hidden ${eventBlockClasses(ev)}`}
                    style={{ top, height }}
                  >
                    <div className="font-medium truncate">{ev.title || "(untitled)"}</div>
                    <div className="truncate">{fmtTime(s)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cols(n: number): React.CSSProperties {
  return { gridTemplateColumns: `48px repeat(${n}, minmax(0, 1fr))` };
}
