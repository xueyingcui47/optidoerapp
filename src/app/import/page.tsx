"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  EVENT_TEMPLATE,
  NOTE_TEMPLATE,
  autoGuess,
  dedupEvents,
  dedupNotes,
  detectTable,
  exportToCSV,
  parseCSV,
  parseICS,
  rowsToEventDrafts,
  rowsToNoteDrafts,
  smartImport,
  type DetectedTable,
  type ImportEventDraft,
  type ImportNoteDraft,
} from "@/lib/import";
import { fmtDateTime } from "@/lib/date";

type Source = "csv" | "ics" | "todoist" | "google" | "apple";
type Target = "events" | "notes";

const EVENT_FIELDS = ["title", "start", "end", "location", "description", "allDay"];
const NOTE_FIELDS = ["title", "content", "tags"];
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  start: "Start time",
  end: "End time",
  location: "Location",
  description: "Notes",
  allDay: "All-day",
  content: "Content",
  tags: "Tags",
};

export default function ImportPage() {
  const [source, setSource] = useState<Source>("csv");
  const { state } = useStore();
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Import / Export</h1>
        <p className="text-slate-500 text-sm">
          Bring tasks, notes, and calendars in from other tools — auto-detects headers and fields, with preview / dedup / undo
        </p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-700">Export all data</div>
          <p className="text-xs text-slate-500">
            Exports a CSV with a column layout close to mainstream tools like TickTick, so you can import it elsewhere (minor differences expected).
          </p>
        </div>
        <button
          onClick={() =>
            downloadText(
              `optidoerapp-export-${new Date().toISOString().slice(0, 10)}.csv`,
              exportToCSV(state.events, state.notes)
            )
          }
          disabled={state.events.length === 0 && state.notes.length === 0}
          className="shrink-0 text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
        >
          ↓ Export CSV ({state.events.length} events + {state.notes.length} notes)
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["csv", "CSV (TickTick / Todoist / etc.)"],
          ["ics", "Calendar file (.ics)"],
          ["todoist", "Todoist connect"],
          ["google", "Google"],
          ["apple", "Apple"],
        ] as [Source, string][]).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`text-sm rounded-lg px-3 py-1.5 border ${
              source === s
                ? "bg-brand-600 text-white border-brand-600"
                : "border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "csv" && <CsvImporter />}
      {source === "ics" && <IcsImporter />}
      {(source === "todoist" || source === "google" || source === "apple") && (
        <OAuthPlaceholder source={source} />
      )}
    </div>
  );
}

function ResultBanner({
  parts,
  skipped,
  onUndo,
}: {
  parts: string;
  skipped: number;
  onUndo: () => void;
}) {
  return (
    <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-3 flex items-center justify-between">
      <span>
        Imported {parts}
        {skipped > 0 && `, skipped ${skipped} (duplicates or onboarding content)`}.
      </span>
      <button onClick={onUndo} className="text-emerald-700 underline hover:no-underline">
        Undo this import
      </button>
    </div>
  );
}

/* ───────────────── CSV (smart detection by default) ───────────────── */
function CsvImporter() {
  const { state, addEvent, addNote, deleteEvent, deleteNote } = useStore();
  const [raw, setRaw] = useState("");
  const [table, setTable] = useState<DetectedTable | null>(null);
  const [skipGuide, setSkipGuide] = useState(true);
  const [skipDone, setSkipDone] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<{ eventIds: string[]; noteIds: string[]; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (text: string) => {
    setRaw(text);
    setResult(null);
    const rows = parseCSV(text);
    setTable(rows.length ? detectTable(rows) : null);
  };

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result || ""));
    reader.readAsText(f, "utf-8");
  };

  // Smart-detection result (after dedup)
  const smart = useMemo(() => {
    if (!table) return null;
    const s = smartImport(table, { skipGuide, skipDone });
    const ev = dedupEvents(s.events, state.events);
    const nt = dedupNotes(s.notes, state.notes);
    return {
      events: ev.unique,
      notes: nt.unique,
      dupSkipped: ev.duplicates.length + nt.duplicates.length,
      guideSkipped: s.skippedGuide,
      doneSkipped: s.skippedDone,
      headerRowIndex: s.headerRowIndex,
    };
  }, [table, skipGuide, skipDone, state.events, state.notes]);

  const runSmart = () => {
    if (!smart) return;
    const eventIds = smart.events.map(
      (d) =>
        addEvent({
          ...d,
          completed: false,
          recurrence: "none",
          reminders: [state.settings.defaultReminderOffset],
          source: "import",
        }).id
    );
    const noteIds = smart.notes.map(
      (d) => addNote({ ...d, pinned: false, archived: false, reminderAt: null }).id
    );
    setResult({
      eventIds,
      noteIds,
      skipped: smart.dupSkipped + smart.guideSkipped + smart.doneSkipped,
    });
  };

  const undo = () => {
    if (!result) return;
    result.eventIds.forEach(deleteEvent);
    result.noteIds.forEach(deleteNote);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
          >
            Choose .csv file
          </button>
          <span className="text-xs text-slate-400">or paste CSV text below</span>
          <button
            onClick={() => downloadText("template.csv", EVENT_TEMPLATE)}
            className="ml-auto text-brand-600 hover:underline text-xs"
          >
            ↓ Event template
          </button>
          <button
            onClick={() => downloadText("notes_template.csv", NOTE_TEMPLATE)}
            className="text-brand-600 hover:underline text-xs"
          >
            ↓ Notes template
          </button>
        </div>

        <textarea
          value={raw}
          onChange={(e) => load(e.target.value)}
          placeholder="Paste any CSV content here — headers and fields are detected automatically"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
        />

        {table && (
          <div className="text-xs text-slate-500">
            ✓ Header row found (row {table.headerRowIndex + 1}), detected {table.headers.length} columns:
            <span className="text-slate-700"> {table.headers.filter(Boolean).join(" · ")}</span>
          </div>
        )}
      </div>

      {smart && !advanced && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-700 text-sm">
                Detected: {smart.events.length} event(s) · {smart.notes.length} note(s)
              </h3>
              <button
                onClick={runSmart}
                disabled={!!result || (smart.events.length === 0 && smart.notes.length === 0)}
                className="text-sm bg-brand-600 text-white rounded-lg px-4 py-1.5 hover:bg-brand-700 disabled:opacity-50"
              >
                Import all
              </button>
            </div>

            <div className="text-xs text-slate-400 flex flex-wrap gap-x-3">
              {smart.doneSkipped > 0 && <span>Skipped {smart.doneSkipped} completed/archived</span>}
              {smart.guideSkipped > 0 && <span>· {smart.guideSkipped} onboarding content</span>}
              {smart.dupSkipped > 0 && <span>· {smart.dupSkipped} duplicates</span>}
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={skipDone} onChange={(e) => setSkipDone(e.target.checked)} />
                Skip completed/archived tasks
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={skipGuide} onChange={(e) => setSkipGuide(e.target.checked)} />
                Skip the app's own welcome/onboarding samples
              </label>
            </div>

            {smart.events.length > 0 && (
              <PreviewTable
                title="Events"
                rows={smart.events.map((d) => ({
                  a: d.title,
                  b: d.allDay
                    ? "All day · " + fmtDateTime(new Date(d.start)).split(" ")[0]
                    : fmtDateTime(new Date(d.start)),
                }))}
              />
            )}
            {smart.notes.length > 0 && (
              <PreviewTable
                title="Notes"
                rows={smart.notes.map((d) => ({
                  a: d.title,
                  b: d.tags.map((t) => `#${t}`).join(" "),
                }))}
              />
            )}
          </div>

          <button
            onClick={() => setAdvanced(true)}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Detection looks off? Adjust field mapping manually →
          </button>
        </>
      )}

      {table && advanced && (
        <ManualMapper
          table={table}
          onBack={() => setAdvanced(false)}
          existingEvents={state.events}
          existingNotes={state.notes}
          onImport={(target, drafts) => {
            if (target === "events") {
              const ids = (drafts as ImportEventDraft[]).map(
                (d) =>
                  addEvent({
                    ...d,
                    completed: false,
                    recurrence: "none",
                    reminders: [state.settings.defaultReminderOffset],
                    source: "import",
                  }).id
              );
              setResult({ eventIds: ids, noteIds: [], skipped: 0 });
            } else {
              const ids = (drafts as ImportNoteDraft[]).map(
                (d) => addNote({ ...d, pinned: false, archived: false, reminderAt: null }).id
              );
              setResult({ eventIds: [], noteIds: ids, skipped: 0 });
            }
          }}
        />
      )}

      {result && (
        <ResultBanner
          parts={[
            result.eventIds.length ? `${result.eventIds.length} event(s)` : "",
            result.noteIds.length ? `${result.noteIds.length} note(s)` : "",
          ]
            .filter(Boolean)
            .join(" + ")}
          skipped={result.skipped}
          onUndo={undo}
        />
      )}
    </div>
  );
}

/* ───────────────── Manual mapping (advanced) ───────────────── */
function ManualMapper({
  table,
  onBack,
  onImport,
  existingEvents,
  existingNotes,
}: {
  table: DetectedTable;
  onBack: () => void;
  onImport: (target: Target, drafts: (ImportEventDraft | ImportNoteDraft)[]) => void;
  existingEvents: ReturnType<typeof useStore>["state"]["events"];
  existingNotes: ReturnType<typeof useStore>["state"]["notes"];
}) {
  const [target, setTarget] = useState<Target>("events");
  const fields = target === "events" ? EVENT_FIELDS : NOTE_FIELDS;
  const [map, setMap] = useState<Record<string, number>>(() => autoGuess(table.headers, EVENT_FIELDS));

  const preview = useMemo(() => {
    if (target === "events") {
      const { ok, errors } = rowsToEventDrafts(table.rows, map);
      const { unique, duplicates } = dedupEvents(ok, existingEvents);
      return { unique, dup: duplicates.length, errors };
    }
    const { ok, errors } = rowsToNoteDrafts(table.rows, map);
    const { unique, duplicates } = dedupNotes(ok, existingNotes);
    return { unique, dup: duplicates.length, errors };
  }, [target, map, table.rows, existingEvents, existingNotes]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-700 text-sm">Manual field mapping</h3>
        <button onClick={onBack} className="text-xs text-slate-500 underline">
          ← Back to smart detection
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-600">Import as:</span>
        {(["events", "notes"] as Target[]).map((t) => (
          <label key={t} className="flex items-center gap-1">
            <input
              type="radio"
              checked={target === t}
              onChange={() => {
                setTarget(t);
                setMap(autoGuess(table.headers, t === "events" ? EVENT_FIELDS : NOTE_FIELDS));
              }}
            />
            {t === "events" ? "Calendar events" : "Notes"}
          </label>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm">
            <span className="w-20 text-slate-600">{FIELD_LABELS[f]}</span>
            <select
              value={map[f] ?? -1}
              onChange={(e) => setMap({ ...map, [f]: parseInt(e.target.value, 10) })}
              className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
            >
              <option value={-1}>— Don't import —</option>
              {table.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Column ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {preview.unique.length} ready to import
          {preview.dup > 0 && ` · ${preview.dup} duplicates`}
          {preview.errors.length > 0 && ` · ${preview.errors.length} row(s) with errors`}
        </span>
        <button
          onClick={() => onImport(target, preview.unique)}
          disabled={preview.unique.length === 0}
          className="text-sm bg-brand-600 text-white rounded-lg px-4 py-1.5 hover:bg-brand-700 disabled:opacity-50"
        >
          Import {preview.unique.length}
        </button>
      </div>
    </div>
  );
}

/* ───────────────── ICS ───────────────── */
function IcsImporter() {
  const { state, addEvent, deleteEvent } = useStore();
  const [drafts, setDrafts] = useState<ImportEventDraft[] | null>(null);
  const [result, setResult] = useState<{ ids: string[]; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setDrafts(parseICS(String(reader.result || "")));
      setResult(null);
    };
    reader.readAsText(f, "utf-8");
  };

  const dedup = useMemo(
    () => (drafts ? dedupEvents(drafts, state.events) : null),
    [drafts, state.events]
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-600 mb-3">
          Upload a standard <code>.ics</code> file exported from Apple Calendar / Google Calendar / Outlook.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
        >
          Choose .ics file
        </button>
      </div>

      {dedup && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-slate-700 text-sm">
              {dedup.unique.length} event(s) ready to import
              {dedup.duplicates.length > 0 && (
                <span className="text-amber-600"> · {dedup.duplicates.length} duplicate(s) skipped</span>
              )}
            </h3>
            <button
              onClick={() => {
                const ids = dedup.unique.map(
                  (d) =>
                    addEvent({
                      ...d,
                      completed: false,
                      recurrence: "none",
                      reminders: [state.settings.defaultReminderOffset],
                      source: "import",
                    }).id
                );
                setResult({ ids, skipped: dedup.duplicates.length });
              }}
              disabled={!!result || dedup.unique.length === 0}
              className="text-sm bg-brand-600 text-white rounded-lg px-4 py-1.5 hover:bg-brand-700 disabled:opacity-50"
            >
              Import
            </button>
          </div>
          <PreviewTable
            title="Events"
            rows={dedup.unique.map((d) => ({
              a: d.title,
              b: d.allDay ? "All day" : fmtDateTime(new Date(d.start)),
            }))}
          />
        </div>
      )}

      {result && (
        <ResultBanner
          parts={`${result.ids.length} event(s)`}
          skipped={result.skipped}
          onUndo={() => {
            result.ids.forEach(deleteEvent);
            setResult(null);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────── Preview table ───────────────── */
function PreviewTable({ title, rows }: { title: string; rows: { a: string; b: string }[] }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{title} (first 50 shown)</div>
      <div className="max-h-56 overflow-auto border border-slate-100 rounded">
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-800 truncate max-w-[60%]">{r.a}</td>
                <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 50 && (
          <div className="text-xs text-slate-400 px-2 py-1">… {rows.length} total, all will be processed on import</div>
        )}
      </div>
    </div>
  );
}

/* ───────────────── OAuth placeholder ───────────────── */
function OAuthPlaceholder({ source }: { source: Source }) {
  const info: Record<string, { name: string; how: string }> = {
    todoist: { name: "Todoist", how: "Import tasks, projects, due dates, and tags via the Todoist API (OAuth / token)." },
    google: { name: "Google", how: "Import Google Tasks + Google Calendar via OAuth." },
    apple: { name: "Apple", how: "Import reminders + calendars via CalDAV or an exported .ics file." },
  };
  const i = info[source];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
      <div className="text-lg font-medium text-slate-800">{i.name} direct connect</div>
      <p className="text-sm text-slate-500 max-w-md mx-auto">{i.how}</p>
      <div className="inline-block text-xs rounded bg-slate-100 text-slate-500 px-2 py-1">
        Requires an OAuth app key · planned for Phase 2
      </div>
      <p className="text-xs text-slate-400">
        For now, export your data from {i.name} as CSV{source === "apple" ? " / .ics" : ""} and use the "CSV / .ics" tab above (fields are detected automatically).
      </p>
    </div>
  );
}

/* ───────────────── Utilities ───────────────── */
function downloadText(filename: string, text: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
