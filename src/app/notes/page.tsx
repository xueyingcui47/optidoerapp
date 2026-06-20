"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { RichTextEditor } from "@/components/RichTextEditor";
import { noteSnippet } from "@/lib/reminders";
import { toLocalInputValue } from "@/lib/date";

export default function NotesPage() {
  const { state, addNote, updateNote, deleteNote } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return state.notes
      .filter((n) => (showArchived ? n.archived : !n.archived))
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.contentHtml.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      });
  }, [state.notes, query, showArchived]);

  const selected = state.notes.find((n) => n.id === selectedId) || null;

  const handleNew = () => {
    const note = addNote({ title: "New note" });
    setSelectedId(note.id);
    setShowArchived(false);
  };

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-3 border-b border-slate-200 space-y-2">
          <button
            onClick={handleNew}
            className="w-full rounded-lg bg-brand-600 text-white text-sm font-medium py-2 hover:bg-brand-700"
          >
            ＋ New note
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title/content/tags…"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <p className="text-slate-400 text-sm p-4">No notes.</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className={`block w-full text-left px-4 py-3 border-b border-slate-100 ${
                  n.id === selectedId ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1">
                  {n.pinned && <span className="text-xs">📌</span>}
                  <span className="font-medium text-slate-800 truncate">
                    {n.title || "(untitled)"}
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate">{noteSnippet(n, 60)}</div>
                {n.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.tags.map((t) => (
                      <span key={t} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            Select a note, or create a new one.
          </div>
        ) : (
          <NoteEditor
            key={selected.id}
            note={selected}
            onChange={(patch) => updateNote(selected.id, patch)}
            onDelete={() => {
              deleteNote(selected.id);
              setSelectedId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onChange,
  onDelete,
}: {
  note: ReturnType<typeof useStore>["state"]["notes"][number];
  onChange: (patch: Partial<typeof note>) => void;
  onDelete: () => void;
}) {
  const [tagInput, setTagInput] = useState("");

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Title"
          className="flex-1 text-2xl font-bold focus:outline-none bg-transparent"
        />
        <button
          onClick={() => onChange({ pinned: !note.pinned })}
          title="Pin"
          className={`px-2 py-1 rounded text-sm ${
            note.pinned ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100"
          }`}
        >
          📌
        </button>
        <button
          onClick={() => onChange({ archived: !note.archived })}
          className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-100"
        >
          {note.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1 rounded text-sm text-red-500 hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {note.tags.map((t) => (
          <span
            key={t}
            className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5 flex items-center gap-1"
          >
            #{t}
            <button
              onClick={() => onChange({ tags: note.tags.filter((x) => x !== t) })}
              className="text-slate-400 hover:text-red-500"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tagInput.trim()) {
              const t = tagInput.trim().replace(/^#/, "");
              if (!note.tags.includes(t)) onChange({ tags: [...note.tags, t] });
              setTagInput("");
            }
          }}
          placeholder="Add tag ↵"
          className="text-xs border border-slate-200 rounded px-2 py-0.5 w-24 focus:outline-none"
        />
      </div>

      <RichTextEditor
        value={note.contentHtml}
        onChange={(html) => onChange({ contentHtml: html })}
      />

      {/* Note reminder (SOW 4.2: can manually attach a reminder) */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <label>Reminder:</label>
        <input
          type="datetime-local"
          value={note.reminderAt ? toLocalInputValue(new Date(note.reminderAt)) : ""}
          onChange={(e) =>
            onChange({ reminderAt: e.target.value ? new Date(e.target.value).toISOString() : null })
          }
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        />
        {note.reminderAt && (
          <button
            onClick={() => onChange({ reminderAt: null })}
            className="text-slate-400 hover:text-red-500 text-xs"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
