"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { parseEvent } from "@/lib/ai";
import { parseLocalDateOnly, toLocalInputValue } from "@/lib/date";
import { EVENT_COLOR_OPTIONS } from "@/lib/eventColors";
import type { CalendarEvent, RecurrenceFreq } from "@/lib/types";

type Draft = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

const REMINDER_OPTIONS = [
  { v: 0, label: "At start time" },
  { v: 10, label: "10 minutes before" },
  { v: 60, label: "1 hour before" },
  { v: 1440, label: "1 day before" },
];

export function EventEditor({
  initial,
  editingId,
  occurrenceIndex = 0,
  onClose,
}: {
  initial: Draft;
  editingId: string | null;
  /** Which occurrence (0 = first/original) the user clicked, for recurring events. */
  occurrenceIndex?: number;
  onClose: () => void;
}) {
  const { addEvent, updateEvent, deleteEvent, state, updateSettings, logAi } = useStore();
  const [draft, setDraft] = useState<Draft>(initial);
  const [customDaysInput, setCustomDaysInput] = useState(String(initial.customIntervalDays ?? 1));
  const [occurrencesInput, setOccurrencesInput] = useState(String(initial.recurrenceOccurrences ?? 5));
  const endless = draft.recurrenceOccurrences == null;
  // 试用期间给全功能（含 AI）；订阅后只有 AI 档（tier2）才能用自然语言建事件。
  const aiAllowed = !state.account?.subscribed || state.account.plan === "tier2";
  const [showDeleteChoice, setShowDeleteChoice] = useState(false);
  const dateError =
    new Date(draft.end) < new Date(draft.start) ? "End must be on or after the start." : null;

  // AI natural-language input
  const [nl, setNl] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const runAi = async () => {
    if (!nl.trim()) return;
    setAiBusy(true);
    setAiError(null);
    setAiMsg(null);
    try {
      const { draft: parsed, engine, fallback } = await parseEvent(nl.trim());
      const recurrence = parsed.recurrence ?? "none";
      const recurrenceOccurrences = parsed.recurrenceOccurrences ?? null;
      set({
        title: parsed.title || draft.title,
        location: parsed.location || "",
        description: parsed.description || "",
        allDay: parsed.allDay,
        start: parsed.start || draft.start,
        end: parsed.end || draft.end,
        source: "ai",
        recurrence,
        customIntervalDays: parsed.customIntervalDays ?? undefined,
        recurrenceOccurrences,
      });
      // Keep the buffered number-input text in sync, since those inputs hold their own
      // typing-friendly local state separate from the draft (see customDaysInput/occurrencesInput).
      if (recurrence === "custom") setCustomDaysInput(String(parsed.customIntervalDays ?? 1));
      if (recurrenceOccurrences != null) setOccurrencesInput(String(recurrenceOccurrences));
      logAi({
        feature: "nl-event",
        inputChars: nl.trim().length,
        engine,
        summary: parsed.title || "(untitled)",
      });
      const conf = { high: "high", medium: "medium", low: "low" }[parsed.confidence];
      setAiMsg(
        `Generated (engine: ${engine === "claude" ? "Claude" : "local mock"}${
          fallback ? ", Claude call failed and fell back" : ""
        }, confidence: ${conf}). ${parsed.note ?? ""}Please review before saving.`
      );
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const handleAiClick = () => {
    if (!state.settings.aiPrivacyAcknowledged) {
      setShowPrivacy(true);
      return;
    }
    runAi();
  };

  const save = () => {
    if (dateError) return;
    if (editingId) updateEvent(editingId, draft);
    else addEvent(draft);
    onClose();
  };

  return (
    // 点对话框外面的半透明背景 = 自动保存并关闭（跟点 Save 按钮是同一个动作），
    // 不用每次都先点 Save 再关。inner box 上的 stopPropagation 防止点对话框内部时误触发。
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={save}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">
            {editingId ? "Edit event" : "New event"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* AI natural-language creation (flagship feature) — full access during trial,
              AI Plan only once subscribed. */}
          {state.settings.aiNlEventEnabled && aiAllowed && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
              <div className="text-sm font-medium text-brand-800 mb-2">
                ✨ Create with natural language
              </div>
              <textarea
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                placeholder="e.g. lunch with Sam tomorrow at noon / next monday 10am-11am sync"
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleAiClick}
                  disabled={aiBusy || !nl.trim()}
                  className="rounded-lg bg-brand-600 text-white text-sm px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                >
                  {aiBusy ? "Parsing…" : "AI fill in"}
                </button>
                {aiMsg && <span className="text-xs text-slate-600">{aiMsg}</span>}
                {aiError && <span className="text-xs text-red-600">{aiError}</span>}
              </div>
            </div>
          )}
          {state.settings.aiNlEventEnabled && !aiAllowed && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                ✨ <strong>Create with natural language</strong> is an AI Plan feature.
              </div>
              <a href="/settings" className="text-sm text-brand-600 font-medium hover:underline whitespace-nowrap">
                Upgrade
              </a>
            </div>
          )}

          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              className="input"
            />
          </Field>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.completed}
                onChange={(e) => set({ completed: e.target.checked })}
              />
              Completed
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(e) => set({ allDay: e.target.checked })}
              />
              All-day event
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={toLocalInputValue(new Date(draft.start)).slice(0, 10)}
                  onChange={(e) => {
                    const cur = new Date(draft.start);
                    const newStart = parseLocalDateOnly(e.target.value);
                    if (!draft.allDay) newStart.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
                    // Changing the start resets the end to match (same day, or +1h if timed) —
                    // if you want a multi-day span, stretch the end afterward.
                    const newEnd = draft.allDay
                      ? new Date(newStart)
                      : new Date(newStart.getTime() + 60 * 60 * 1000);
                    set({ start: newStart.toISOString(), end: newEnd.toISOString() });
                  }}
                  className="input"
                />
                {!draft.allDay && (
                  <TimeOfDayPicker
                    value={new Date(draft.start)}
                    onChange={(newStart) => {
                      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
                      set({ start: newStart.toISOString(), end: newEnd.toISOString() });
                    }}
                  />
                )}
              </div>
            </Field>
            <Field label="End">
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={toLocalInputValue(new Date(draft.end)).slice(0, 10)}
                  onChange={(e) => {
                    const cur = new Date(draft.end);
                    const newEnd = parseLocalDateOnly(e.target.value);
                    if (!draft.allDay) newEnd.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
                    set({ end: newEnd.toISOString() });
                  }}
                  className="input"
                />
                {!draft.allDay && (
                  <TimeOfDayPicker value={new Date(draft.end)} onChange={(newEnd) => set({ end: newEnd.toISOString() })} />
                )}
              </div>
              {dateError && <p className="text-xs text-red-600 mt-1">{dateError}</p>}
            </Field>
          </div>

          <Field label="Location">
            <input
              value={draft.location}
              onChange={(e) => set({ location: e.target.value })}
              className="input"
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              className="input"
            />
          </Field>

          <div className="flex items-start justify-between gap-4">
            <Field label="Flag color">
              <div className="flex items-center gap-2">
                {EVENT_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    title={c.label}
                    onClick={() => set({ color: c.key === "default" ? undefined : c.key })}
                    className={`w-6 h-6 rounded-full ${c.dot} ${
                      (draft.color ?? "default") === c.key
                        ? "ring-2 ring-offset-2 ring-slate-400"
                        : ""
                    }`}
                  />
                ))}
              </div>
            </Field>
            <Field label="Reminder" align="right">
              <select
                value={draft.reminders[0] ?? -1}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  set({ reminders: v < 0 ? [] : [v] });
                }}
                className="input-sm w-[150px]"
              >
                <option value={-1}>None</option>
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Repeat">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={draft.recurrence}
                onChange={(e) => set({ recurrence: e.target.value as RecurrenceFreq })}
                className="input-sm w-32 shrink-0"
              >
                <option value="none">Doesn't repeat</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Every weekday</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
              {draft.recurrence === "custom" && (
                <div className="flex items-center gap-1 text-sm text-slate-600 whitespace-nowrap shrink-0">
                  Every
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={customDaysInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomDaysInput(raw);
                      const n = parseInt(raw, 10);
                      if (!isNaN(n) && n >= 1 && n <= 999) set({ customIntervalDays: n });
                    }}
                    onBlur={() => {
                      const n = parseInt(customDaysInput, 10);
                      const clamped = !isNaN(n) ? Math.min(999, Math.max(1, n)) : 1;
                      setCustomDaysInput(String(clamped));
                      set({ customIntervalDays: clamped });
                    }}
                    className="input-sm w-16 px-1 text-center shrink-0"
                  />
                  day(s)
                </div>
              )}
              {draft.recurrence !== "none" && (
                <select
                  value={endless ? "endless" : "count"}
                  onChange={(e) => {
                    if (e.target.value === "endless") set({ recurrenceOccurrences: null });
                    else {
                      const n = parseInt(occurrencesInput, 10);
                      set({ recurrenceOccurrences: !isNaN(n) && n >= 1 ? n : 5 });
                    }
                  }}
                  className="input-sm w-32 shrink-0"
                >
                  <option value="endless">Endless</option>
                  <option value="count">Ends after</option>
                </select>
              )}
              {draft.recurrence !== "none" && !endless && (
                <div className="flex items-center gap-1 text-sm text-slate-600 whitespace-nowrap shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={occurrencesInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setOccurrencesInput(raw);
                      const n = parseInt(raw, 10);
                      if (!isNaN(n) && n >= 1 && n <= 999) set({ recurrenceOccurrences: n });
                    }}
                    onBlur={() => {
                      const n = parseInt(occurrencesInput, 10);
                      const clamped = !isNaN(n) ? Math.min(999, Math.max(1, n)) : 1;
                      setOccurrencesInput(String(clamped));
                      set({ recurrenceOccurrences: clamped });
                    }}
                    className="input-sm w-16 px-1 text-center shrink-0"
                  />
                  time(s)
                </div>
              )}
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
          <div>
            {editingId && (
              <button
                onClick={() => {
                  if (draft.recurrence !== "none") setShowDeleteChoice(true);
                  else {
                    deleteEvent(editingId);
                    onClose();
                  }
                }}
                className="text-sm text-red-500 hover:bg-red-50 rounded px-3 py-1.5"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm text-slate-600 rounded px-3 py-1.5 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!!dateError}
              className="text-sm bg-brand-600 text-white rounded px-4 py-1.5 hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* First-time AI privacy acknowledgement (SOW 4.4b.3 / AI guide 4.1) */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="font-semibold text-slate-800 mb-2">About AI parsing & privacy</h3>
            <p className="text-sm text-slate-600 mb-4">
              This feature sends the text you type to an AI service (Anthropic Claude) for parsing.
              Anthropic does not use your data to train its models. You can turn this off or review
              your history anytime in Settings → AI.
              <br />
              <br />
              If no API key is configured, this uses a <b>local mock parser</b> instead — your data
              never leaves this device.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPrivacy(false)}
                className="text-sm text-slate-600 rounded px-3 py-1.5 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateSettings({ aiPrivacyAcknowledged: true });
                  setShowPrivacy(false);
                  runAi();
                }}
                className="text-sm bg-brand-600 text-white rounded px-4 py-1.5 hover:bg-brand-700"
              >
                Agree & continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring event delete: ask whether to truncate the series or remove all of it. */}
      {showDeleteChoice && editingId && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="font-semibold text-slate-800 mb-2">Delete recurring event</h3>
            <p className="text-sm text-slate-600 mb-4">
              This event repeats. Do you want to delete just this and all future occurrences, or
              the entire series (including past ones)?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (occurrenceIndex === 0) deleteEvent(editingId);
                  else {
                    const newCount =
                      draft.recurrenceOccurrences != null
                        ? Math.min(draft.recurrenceOccurrences, occurrenceIndex)
                        : occurrenceIndex;
                    updateEvent(editingId, { recurrenceOccurrences: newCount });
                  }
                  setShowDeleteChoice(false);
                  onClose();
                }}
                className="text-sm text-left rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50"
              >
                This and following occurrences
              </button>
              <button
                onClick={() => {
                  deleteEvent(editingId);
                  setShowDeleteChoice(false);
                  onClose();
                }}
                className="text-sm text-left rounded-lg border border-red-200 text-red-600 px-3 py-2 hover:bg-red-50"
              >
                Entire series
              </button>
              <button
                onClick={() => setShowDeleteChoice(false)}
                className="text-sm text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* font-size 必须 ≥16px——手机浏览器（尤其 iOS WebKit，包括手机上的 Chrome，因为
           iOS 上所有浏览器底层都是 WebKit）对小于 16px 的输入框会在聚焦时自动放大整页面，
           松手后页面停留在放大状态，于是又能左右晃/滑了。之前这里是 0.875rem(14px)，
           正好踩中这个坑。 */
        :global(.input) {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.5rem;
          padding: 0.4rem 0.6rem;
          font-size: 16px;
        }
        :global(.input:focus) {
          outline: none;
          box-shadow: 0 0 0 2px rgb(124 154 255);
        }
        :global(.input-sm) {
          border: 1px solid rgb(203 213 225);
          border-radius: 0.5rem;
          padding: 0.4rem 0.6rem;
          font-size: 16px;
        }
        :global(.input-sm:focus) {
          outline: none;
          box-shadow: 0 0 0 2px rgb(124 154 255);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  align,
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "flex flex-col items-end" : undefined}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function hour24To12(h: number): { h12: number; ampm: "AM" | "PM" } {
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { h12, ampm };
}

function hour12To24(h12: number, ampm: "AM" | "PM"): number {
  const h = h12 % 12;
  return ampm === "PM" ? h + 12 : h;
}

const HOURS_1_TO_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_0_TO_59 = Array.from({ length: 60 }, (_, i) => i);

// 时间选择用普通 <select> 而不是原生 time/datetime-local 那种滚轮控件——下拉列表天生
// 到了第一项/最后一项就停住，不会像滚轮一样从 12 转回 1、从 59 转回 0。
function TimeOfDayPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const { h12, ampm } = hour24To12(value.getHours());
  const minute = value.getMinutes();

  const apply = (patch: { h12?: number; minute?: number; ampm?: "AM" | "PM" }) => {
    const next = new Date(value);
    next.setHours(
      hour12To24(patch.h12 ?? h12, patch.ampm ?? ampm),
      patch.minute ?? minute,
      0,
      0
    );
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={h12}
        onChange={(e) => apply({ h12: Number(e.target.value) })}
        className="input px-1.5 min-w-0 flex-1"
      >
        {HOURS_1_TO_12.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select
        value={minute}
        onChange={(e) => apply({ minute: Number(e.target.value) })}
        className="input px-1.5 min-w-0 flex-1"
      >
        {MINUTES_0_TO_59.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(e) => apply({ ampm: e.target.value as "AM" | "PM" })}
        className="input px-1.5 min-w-0 flex-1"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
