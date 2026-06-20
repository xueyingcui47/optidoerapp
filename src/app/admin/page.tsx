"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabaseClient";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  trial_started_at: string;
  subscribed: boolean;
  plan: "tier1" | "tier2" | null;
  billing: "monthly" | "yearly" | null;
  subscribed_at: string | null;
  created_at: string;
}

interface AdminNote {
  id: string;
  title: string;
  content_html: string;
  tags: string[];
  updated_at: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [notes, setNotes] = useState<AdminNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  async function authHeader(): Promise<HeadersInit> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { headers: await authHeader() });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        setUsers(null);
      } else {
        setUsers(body.users);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(u: AdminUser, patch: Partial<AdminUser>) {
    setSavingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Save failed");
        return;
      }
      setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, ...patch } : x)) ?? null);
    } finally {
      setSavingId(null);
    }
  }

  async function viewNotes(userId: string) {
    if (notesFor === userId) {
      setNotesFor(null);
      setNotes(null);
      return;
    }
    setNotesFor(userId);
    setNotes(null);
    setNotesError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/notes`, { headers: await authHeader() });
      const body = await res.json();
      if (!res.ok) setNotesError(body.error || `Request failed (${res.status})`);
      else setNotes(body.notes);
    } catch (e) {
      setNotesError((e as Error).message);
    }
  }

  if (!supabaseEnabled) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-slate-500">The admin backend needs Supabase configured first (see .env.local).</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Admin</h1>
        <p className="text-slate-500 text-sm">
          Edit a user's trial end date / subscription status, or view a user's notes. Every action
          goes through a server-side API using the service_role key to bypass normal user
          permissions — only accounts in the ADMIN_EMAILS allowlist in .env.local can get in.
        </p>
      </header>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">
          {error}
          <div className="text-xs text-red-500 mt-1">
            If this says "not in the admin allowlist" — add your login email to ADMIN_EMAILS in .env.local and restart the dev server.
          </div>
        </div>
      )}

      {users && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Trial start</th>
                <th className="px-3 py-2">Subscribed</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Billing</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  saving={savingId === u.id}
                  onSave={(patch) => save(u, patch)}
                  onViewNotes={() => viewNotes(u.id)}
                  showingNotes={notesFor === u.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notesFor && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-700 text-sm mb-2">
            Notes for {users?.find((u) => u.id === notesFor)?.email}
          </h2>
          {notesError && <p className="text-sm text-red-600">{notesError}</p>}
          {!notesError && notes === null && <p className="text-sm text-slate-400">Loading…</p>}
          {notes && notes.length === 0 && <p className="text-sm text-slate-400">No notes.</p>}
          {notes && notes.length > 0 && (
            <ul className="space-y-2 max-h-96 overflow-auto">
              {notes.map((n) => (
                <li key={n.id} className="border border-slate-100 rounded-lg p-2">
                  <div className="font-medium text-slate-800">{n.title || "(untitled)"}</div>
                  <div
                    className="text-xs text-slate-500 mt-1"
                    dangerouslySetInnerHTML={{ __html: n.content_html }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  saving,
  onSave,
  onViewNotes,
  showingNotes,
}: {
  user: AdminUser;
  saving: boolean;
  onSave: (patch: Partial<AdminUser>) => void;
  onViewNotes: () => void;
  showingNotes: boolean;
}) {
  const [trialDate, setTrialDate] = useState(user.trial_started_at.slice(0, 10));

  return (
    <tr className="border-b border-slate-100 align-middle">
      <td className="px-3 py-2">{user.name || "—"}</td>
      <td className="px-3 py-2">{user.email}</td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={trialDate}
          onChange={(e) => setTrialDate(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={user.subscribed}
          onChange={(e) => onSave({ subscribed: e.target.checked })}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={user.plan ?? ""}
          onChange={(e) => onSave({ plan: (e.target.value || null) as AdminUser["plan"] })}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">—</option>
          <option value="tier1">Standard</option>
          <option value="tier2">AI Plan</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={user.billing ?? ""}
          onChange={(e) => onSave({ billing: (e.target.value || null) as AdminUser["billing"] })}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">—</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </td>
      <td className="px-3 py-2 flex gap-2">
        <button
          disabled={saving}
          onClick={() => onSave({ trial_started_at: new Date(trialDate).toISOString() })}
          className="text-xs rounded bg-brand-600 text-white px-2 py-1 hover:bg-brand-700 disabled:opacity-50"
        >
          Save trial date
        </button>
        <button
          onClick={onViewNotes}
          className="text-xs rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
        >
          {showingNotes ? "Hide notes" : "View notes"}
        </button>
      </td>
    </tr>
  );
}
