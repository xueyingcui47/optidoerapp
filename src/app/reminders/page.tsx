"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { upcomingReminders } from "@/lib/reminders";
import { fmtDateTime } from "@/lib/date";

export default function RemindersPage() {
  const { state } = useStore();
  const reminders = upcomingReminders(state);

  const testNotification = async () => {
    if (!("Notification" in window)) {
      alert("This browser doesn't support the Notification API.");
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") {
      new Notification("OptiDoerApp", { body: "This is a test push notification 🔔" });
    } else {
      alert("Notification permission was denied.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reminders</h1>
          <p className="text-slate-500 text-sm">Event and note reminders for the next 30 days</p>
        </div>
        <button
          onClick={testNotification}
          className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
        >
          Test push notification
        </button>
      </header>

      <div className="rounded-lg bg-brand-50 text-brand-800 text-xs p-3">
        Channels:
        {state.settings.channels.push && " Device push"}
        {state.settings.channels.push && state.settings.channels.email && " ·"}
        {state.settings.channels.email && " Email"}
        . MVP demo uses browser notifications to simulate device push; server-side scheduling +
        email delivery are backend work (SOW 4.4).
      </div>

      {reminders.length === 0 ? (
        <p className="text-slate-400">No reminders yet. Set a reminder time on an event or note and it'll show up here.</p>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r) => (
            <li key={r.id}>
              <Link
                href={r.kind === "event" ? `/calendar?event=${r.sourceId}` : `/notes?note=${r.sourceId}`}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:border-brand-300 hover:bg-brand-50/30 transition"
              >
                <div>
                  <div className="font-medium text-slate-800">{r.title}</div>
                  <div className="text-sm text-slate-500">
                    {fmtDateTime(r.at)} · {r.offsetLabel}
                  </div>
                </div>
                <span
                  className={`text-xs rounded px-2 py-0.5 ${
                    r.kind === "event"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.kind === "event" ? "Event" : "Note"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
