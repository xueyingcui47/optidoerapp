"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { eventsOnDay, upcomingReminders } from "@/lib/reminders";
import { fmtDate, fmtTime, fmtDateTime, startOfDay, addDays } from "@/lib/date";
import { expandEventsInRange } from "@/lib/recurrence";

export default function TodayPage() {
  const { state } = useStore();
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEvents = eventsOnDay(
    expandEventsInRange(state.events, todayStart, new Date(addDays(todayStart, 1).getTime() - 1)),
    today
  );
  const reminders = upcomingReminders(state).slice(0, 5);
  const recentNotes = state.notes.filter((n) => !n.archived).slice(0, 4);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">
          Hi, {state.account?.name} 👋
        </h1>
        <p className="text-slate-500">{fmtDate(today)}</p>
      </header>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Today's schedule</h2>
          <Link href="/calendar" className="text-sm text-brand-600 hover:underline">
            Open calendar →
          </Link>
        </div>
        {todayEvents.length === 0 ? (
          <p className="text-slate-400 text-sm">Nothing on today. Try "AI create" in the calendar.</p>
        ) : (
          <ul className="space-y-2">
            {todayEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-500 w-28 shrink-0">
                  {ev.allDay ? "All day" : `${fmtTime(new Date(ev.start))}`}
                </span>
                <span className="font-medium text-slate-800">{ev.title}</span>
                {ev.source === "ai" && (
                  <span className="text-xs rounded bg-brand-50 text-brand-600 px-1.5 py-0.5">
                    AI
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Upcoming reminders</h2>
            <Link href="/reminders" className="text-sm text-brand-600 hover:underline">
              All →
            </Link>
          </div>
          {reminders.length === 0 ? (
            <p className="text-slate-400 text-sm">No reminders yet.</p>
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="font-medium text-slate-800">{r.title}</div>
                  <div className="text-slate-500">
                    {fmtDateTime(r.at)} · {r.offsetLabel}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Recent notes</h2>
            <Link href="/notes" className="text-sm text-brand-600 hover:underline">
              All →
            </Link>
          </div>
          {recentNotes.length === 0 ? (
            <p className="text-slate-400 text-sm">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentNotes.map((n) => (
                <li key={n.id} className="text-sm">
                  <Link href="/notes" className="font-medium text-slate-800 hover:text-brand-600">
                    {n.title || "(untitled)"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
