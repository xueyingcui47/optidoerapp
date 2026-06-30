"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { parseEvent } from "@/lib/ai";
import { AI_EVENT_CREATE_ENABLED } from "@/lib/featureFlags";
import { parseLocalDateOnly, toLocalInputValue } from "@/lib/date";
import { EVENT_COLOR_OPTIONS } from "@/lib/eventColors";
import type { CalendarEvent, RecurrenceFreq } from "@/lib/types";

type Draft = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // 循环事件：完成状态是按次的，不是整个系列共享一个布尔值——勾这一次完成，
  // 不会影响以前/以后的其它次。
  const isRecurringOccurrence = draft.recurrence !== "none";
  const completedForThis = isRecurringOccurrence
    ? (draft.completedOccurrences ?? []).includes(occurrenceIndex)
    : draft.completed;
  const toggleCompleted = (checked: boolean) => {
    if (!isRecurringOccurrence) {
      set({ completed: checked });
      return;
    }
    const cur = new Set(draft.completedOccurrences ?? []);
    if (checked) cur.add(occurrenceIndex);
    else cur.delete(occurrenceIndex);
    set({ completedOccurrences: Array.from(cur).sort((a, b) => a - b) });
  };
  const dateError =
    new Date(draft.end) < new Date(draft.start) ? "End must be on or after the start." : null;

  // AI natural-language input —— 折叠在一个按钮后面，点开后输入、点一次「AI fill in」
  // 就直接解析 + 保存 + 关闭，不需要再手动点 Save。
  const [showAi, setShowAi] = useState(false);
  const [nl, setNl] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // 一键完成：解析结果直接拼成事件存库并关闭。不依赖 setDraft 后的 state（那是异步的，
  // 紧接着 save 会拿到旧值），而是用解析出来的值现场构造要保存的事件。
  const runAiAndSave = async () => {
    if (!nl.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const { draft: parsed, engine } = await parseEvent(nl.trim());
      const next: Draft = {
        ...draft,
        title: parsed.title || draft.title || "(untitled)",
        location: parsed.location || "",
        description: parsed.description || "",
        allDay: parsed.allDay,
        start: parsed.start || draft.start,
        end: parsed.end || draft.end,
        source: "ai",
        recurrence: parsed.recurrence ?? "none",
        customIntervalDays: parsed.customIntervalDays ?? undefined,
        recurrenceOccurrences: parsed.recurrenceOccurrences ?? null,
      };
      if (new Date(next.end) < new Date(next.start)) {
        setAiError("The parsed end time is before the start — please create it manually.");
        setAiBusy(false);
        return;
      }
      logAi({
        feature: "nl-event",
        inputChars: nl.trim().length,
        engine,
        summary: parsed.title || "(untitled)",
      });
      // 第一次用即视为已知悉隐私说明（下方有一行常驻提示），不再弹窗多点一次。
      if (!state.settings.aiPrivacyAcknowledged) updateSettings({ aiPrivacyAcknowledged: true });
      if (editingId) updateEvent(editingId, next);
      else addEvent(next);
      onClose();
    } catch (e) {
      setAiError((e as Error).message);
      setAiBusy(false);
    }
  };

  const save = () => {
    if (dateError) return;
    if (editingId) updateEvent(editingId, draft);
    else addEvent(draft);
    onClose();
  };

  // 点对话框外面：标题是空的就没必要保存一个空事件，直接关掉/放弃这次编辑就好。
  const handleBackdropClick = () => {
    if (!draft.title.trim()) {
      onClose();
      return;
    }
    save();
  };

  return (
    // inner box 上的 stopPropagation 防止点对话框内部时误触发外层这个保存动作。
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={handleBackdropClick}>
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
                checked={completedForThis}
                onChange={(e) => toggleCompleted(e.target.checked)}
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
              <div className="flex items-center flex-wrap gap-1">
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
                  className="input w-[6rem] shrink-0 px-1"
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
              <div className="flex items-center flex-wrap gap-1">
                <input
                  type="date"
                  value={toLocalInputValue(new Date(draft.end)).slice(0, 10)}
                  onChange={(e) => {
                    const cur = new Date(draft.end);
                    const newEnd = parseLocalDateOnly(e.target.value);
                    if (!draft.allDay) newEnd.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
                    set({ end: newEnd.toISOString() });
                  }}
                  className="input w-[6rem] shrink-0 px-1"
                />
                {!draft.allDay && (
                  <TimeOfDayPicker value={new Date(draft.end)} onChange={(newEnd) => set({ end: newEnd.toISOString() })} />
                )}
              </div>
              {dateError && <p className="text-xs text-red-600 mt-1">{dateError}</p>}
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={5}
              className="input min-h-[150px] resize-y"
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
            <Field label="Repeat" align="right">
              <div className="flex items-center gap-2 flex-wrap justify-end">
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

          {/* AI 自然语言建事件：默认折叠成一个按钮，点开后输入、点一次 AI fill in 直接
              解析并保存关闭。订阅后非 AI 档（tier2）的用户看到的是升级提示。
              暂时整体隔离掉（AI_EVENT_CREATE_ENABLED=false），以后要加回来只需把开关改回 true。 */}
          {AI_EVENT_CREATE_ENABLED && state.settings.aiNlEventEnabled && aiAllowed && (
            <div className="pt-1">
              {!showAi ? (
                <button
                  type="button"
                  onClick={() => setShowAi(true)}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50/60 text-brand-700 text-sm font-medium py-2.5 hover:bg-brand-50"
                >
                  ✨ Create with AI instead
                </button>
              ) : (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <div className="text-sm font-medium text-brand-800 mb-2">
                    ✨ Describe the event in your own words
                  </div>
                  <textarea
                    value={nl}
                    onChange={(e) => setNl(e.target.value)}
                    placeholder="e.g. lunch with Sam tomorrow at noon / next monday 10am-11am sync"
                    rows={2}
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={runAiAndSave}
                      disabled={aiBusy || !nl.trim()}
                      className="rounded-lg bg-brand-600 text-white text-sm px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                    >
                      {aiBusy ? "Working…" : "AI fill in"}
                    </button>
                    {aiError && <span className="text-xs text-red-600">{aiError}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Sends your text to Anthropic Claude for parsing. Turn this off anytime in Settings → AI.
                  </p>
                </div>
              )}
            </div>
          )}
          {AI_EVENT_CREATE_ENABLED && state.settings.aiNlEventEnabled && !aiAllowed && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                ✨ <strong>Create with AI</strong> is an AI Plan feature.
              </div>
              <a href="/settings" className="text-sm text-brand-600 font-medium hover:underline whitespace-nowrap">
                Upgrade
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
          <div>
            {editingId && (
              <button
                onClick={() => {
                  if (draft.recurrence !== "none") setShowDeleteChoice(true);
                  else setShowDeleteConfirm(true);
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


      {/* Non-recurring delete: simple confirm so a stray tap can't wipe an event. */}
      {showDeleteConfirm && editingId && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h3 className="font-semibold text-slate-800 mb-2">Delete this event?</h3>
            <p className="text-sm text-slate-600 mb-4">This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-sm text-slate-600 rounded-lg px-3 py-2 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteEvent(editingId);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-2"
              >
                Delete
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

const HOURS_0_TO_23 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_0_TO_59 = Array.from({ length: 60 }, (_, i) => i);

// 时间选择用普通 <select> 而不是原生 time/datetime-local 那种滚轮控件——下拉列表天生
// 到了第一项/最后一项就停住，不会像滚轮一样从 23 转回 0。24 小时制，不需要 AM/PM。
function TimeOfDayPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const hour = value.getHours();
  const minute = value.getMinutes();

  const apply = (patch: { hour?: number; minute?: number }) => {
    const next = new Date(value);
    next.setHours(patch.hour ?? hour, patch.minute ?? minute, 0, 0);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      <select
        value={hour}
        onChange={(e) => apply({ hour: Number(e.target.value) })}
        className="input px-1 min-w-0"
      >
        {HOURS_0_TO_23.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select
        value={minute}
        onChange={(e) => apply({ minute: Number(e.target.value) })}
        className="input px-1 min-w-0"
      >
        {MINUTES_0_TO_59.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}
