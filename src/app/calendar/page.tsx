"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { EVENT_COLOR_OPTIONS, eventBlockClasses, eventPillClasses } from "@/lib/eventColors";
import { baseEventId, expandEventsInRange, occurrenceIndex } from "@/lib/recurrence";
import { AI_EVENT_CREATE_ENABLED } from "@/lib/featureFlags";

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
  const { state, updateEvent } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [editor, setEditor] = useState<{ initial: Draft; id: string | null; occurrenceIndex: number } | null>(null);
  // 手机上点月视图里的某一天：不直接弹"新建事件"（格子太小很容易点错/误触），
  // 而是把那一天所在的周放到顶部、用放大的列表展示，方便看清楚再点进具体一项。
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 手机底部 Calendar 标签再次点击时收起 WeekAgenda，回到纯网格视图。
  useEffect(() => {
    const reset = () => setSelectedDay(null);
    window.addEventListener("calendar:reset", reset);
    return () => window.removeEventListener("calendar:reset", reset);
  }, []);

  // 从别的页面（Today/Reminders）点一个事件跳过来时，用 ?event=<id> 直接打开它的编辑框。
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId) return;
    const ev = state.events.find((e) => e.id === eventId);
    if (ev) {
      setCursor(new Date(ev.start));
      setEditor({ initial: { ...ev }, id: ev.id, occurrenceIndex: 0 });
      // Strip the ?event= param so saving (which updates state.events) doesn't
      // re-trigger this effect and reopen the editor after it's closed.
      router.replace("/calendar");
    }
  }, [searchParams]); // intentionally excludes state.events — only re-run when URL changes

  const openNew = (start: Date) => setEditor({ initial: newDraft(start), id: null, occurrenceIndex: 0 });

  // sm 断点（640px）以下视为手机：手机上点一天先展开当周的放大列表，不立刻新建事件。
  const isMobileViewport = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  const handleDayTap = (day: Date) => {
    if (view === "month" && isMobileViewport()) {
      setSelectedDay(day);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    openNew(day);
  };
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
            <span className="hidden sm:inline">＋ New{AI_EVENT_CREATE_ENABLED ? " / AI create" : ""}</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={`flex-1 overflow-auto ${view === "month" && selectedDay ? "bg-white" : "bg-slate-50"}`}>
        {view === "month" && selectedDay && (
          <MobileDayView
            selectedDay={selectedDay}
            events={visibleEvents}
            onDayChange={setSelectedDay}
            onEventClick={openEdit}
            onAddClick={openNew}
            onClose={() => setSelectedDay(null)}
          />
        )}
        {view === "month" && (
          <div className={selectedDay ? "hidden sm:block" : ""}>
            <MonthGrid
              cursor={cursor}
              events={visibleEvents}
              onDayClick={handleDayTap}
              onEventClick={openEdit}
              onEventMove={updateEvent}
            />
          </div>
        )}
        {view === "week" && (
          <TimeGrid
            days={weekDays(cursor)}
            events={visibleEvents}
            onSlotClick={openNew}
            onEventClick={openEdit}
            onEventMove={updateEvent}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[new Date(cursor)]}
            events={visibleEvents}
            onSlotClick={openNew}
            onEventClick={openEdit}
            onEventMove={updateEvent}
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

/* ─────────────── 手机端：TickTick 风格 day view ─────────────── */
function MobileDayView({
  selectedDay,
  events,
  onDayChange,
  onEventClick,
  onAddClick,
  onClose,
}: {
  selectedDay: Date;
  events: CalendarEvent[];
  onDayChange: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onAddClick: (d: Date) => void;
  onClose: () => void;
}) {
  const days = weekDays(selectedDay);
  const dayEvents = eventsOnDay(events, selectedDay);
  const allDayEvs = dayEvents.filter((e) => e.allDay);
  const timedEvs = dayEvents
    .filter((e) => !e.allDay)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return (
    <div className="sm:hidden flex flex-col h-full bg-white">
      {/* Week strip */}
      <div className="border-b border-slate-200 px-1 pt-2 pb-1 bg-white">
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const sel = sameDay(d, selectedDay);
            const tod = isToday(d);
            const hasEv = eventsOnDay(events, d).length > 0;
            return (
              <button
                key={i}
                onClick={() => onDayChange(d)}
                className="flex flex-col items-center gap-[3px] py-1"
              >
                <span className="text-[11px] text-slate-400">{WEEK_LABELS[i].charAt(0)}</span>
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    sel
                      ? "bg-brand-600 text-white font-semibold"
                      : tod
                      ? "text-brand-600 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span
                  className={`w-1 h-1 rounded-full ${
                    hasEv ? (sel ? "bg-white/70" : "bg-brand-400") : "invisible"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <button onClick={onClose} className="text-sm text-slate-500 flex items-center gap-1">
          ‹ Month
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {selectedDay.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <button
          onClick={() => onAddClick(selectedDay)}
          className="text-sm bg-brand-600 text-white rounded-lg px-3 py-1.5"
        >
          ＋ Add
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {dayEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center px-8">
            <p className="text-slate-200 text-5xl select-none">○</p>
            <p className="text-slate-400 text-sm">No events</p>
            <button
              onClick={() => onAddClick(selectedDay)}
              className="text-sm text-brand-600 font-medium"
            >
              ＋ Add an event
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            {allDayEvs.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onEventClick(ev)}
                className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-2 ${eventPillClasses(ev)}`}
              >
                <span className="text-xs opacity-60 uppercase tracking-wider shrink-0">All day</span>
                <span className="font-medium text-sm truncate">{ev.title || "(untitled)"}</span>
              </button>
            ))}
            {timedEvs.map((ev) => {
              const dotClass =
                EVENT_COLOR_OPTIONS.find((o) => o.key === (ev.color ?? "default"))?.dot ?? "bg-brand-400";
              return (
                <button
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className="w-full text-left bg-white rounded-xl border border-slate-200 overflow-hidden flex active:bg-slate-50"
                >
                  <div className={`w-[5px] shrink-0 ${dotClass}`} />
                  <div className="flex items-start gap-3 px-3 py-3 w-full min-w-0">
                    <div className="text-xs text-slate-400 shrink-0 pt-0.5 min-w-[2.8rem] text-right leading-5">
                      <div>{fmtTime(new Date(ev.start))}</div>
                      <div className="opacity-60">{fmtTime(new Date(ev.end))}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium truncate ${
                          ev.completed ? "line-through text-slate-400" : "text-slate-800"
                        }`}
                      >
                        {ev.title || "(untitled)"}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{ev.location}</p>
                      )}
                      {!ev.location && ev.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{ev.description}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────── 月视图 ───────────────── */
function MonthGrid({
  cursor,
  events,
  onDayClick,
  onEventClick,
  onEventMove,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventMove: (id: string, patch: Partial<CalendarEvent>) => void;
}) {
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const [dragOver, setDragOver] = useState<number | null>(null);

  // 拖到新的一天：日期换成目标日，时间（如果不是全天事件）原样保留，时长也保持不变。
  // 只对非循环事件开放拖拽——循环事件的"某一次"目前没有单独改日期的数据结构，
  // 直接拖会牵动整个系列，容易让人意外，所以先不让它能拖（点开还是能正常编辑）。
  const handleDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    const oldStart = new Date(ev.start);
    const duration = new Date(ev.end).getTime() - oldStart.getTime();
    const newStart = new Date(day);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), 0);
    const newEnd = new Date(newStart.getTime() + duration);
    onEventMove(id, { start: newStart.toISOString(), end: newEnd.toISOString() });
  };

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
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDragOver(i)}
            onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
            onDrop={(e) => handleDrop(e, day)}
            className={`min-h-[64px] sm:min-h-[96px] border-r border-b border-slate-200 p-0.5 sm:p-1 cursor-pointer hover:bg-slate-50 ${
              inMonth ? "" : "bg-slate-50/60"
            } ${dragOver === i ? "bg-brand-50 ring-2 ring-inset ring-brand-300" : ""}`}
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
                  draggable={ev.recurrence === "none"}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData("text/plain", ev.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(ev);
                  }}
                  className={`block w-full text-left truncate text-[11px] rounded px-1 py-0.5 ${eventPillClasses(ev)} ${
                    ev.recurrence === "none" ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
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
  onEventMove,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSlotClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventMove: (id: string, patch: Partial<CalendarEvent>) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const HOUR_PX = 48;

  // 拖动时记下"抓的位置离事件块顶部多远"，放下时减掉这个偏移，块顶才会落在指针处而不是
  // 让指针变成块顶。只对非循环事件开放拖拽（和月视图一致）。
  const grabOffsetY = useRef(0);

  const handleDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top - grabOffsetY.current;
    const clampedY = Math.max(0, Math.min(24 * HOUR_PX, y));
    // 落点 → 分钟，按 15 分钟吸附。
    const rawMinutes = (clampedY / HOUR_PX) * 60;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const duration = new Date(ev.end).getTime() - new Date(ev.start).getTime();
    const newStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    newStart.setMinutes(snapped);
    const newEnd = new Date(newStart.getTime() + duration);
    onEventMove(id, { start: newStart.toISOString(), end: newEnd.toISOString() });
  };

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
            <div
              key={di}
              className="relative border-r border-slate-200"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, day)}
            >
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
                const draggable = ev.recurrence === "none";
                return (
                  <button
                    key={ev.id}
                    draggable={draggable}
                    onDragStart={(e) => {
                      grabOffsetY.current = e.nativeEvent.offsetY;
                      e.dataTransfer.setData("text/plain", ev.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onEventClick(ev)}
                    className={`absolute left-1 right-1 rounded text-[11px] px-1 py-0.5 text-left overflow-hidden ${eventBlockClasses(ev)} ${
                      draggable ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
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
