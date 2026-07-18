"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { TRIAL_DAYS } from "@/lib/date";
import { supabaseEnabled } from "@/lib/supabaseClient";

export function Onboarding() {
  return supabaseEnabled ? <AuthForm /> : <LocalOnlyForm />;
}

/** Supabase configured: real email + password sign up / sign in. */
function AuthForm() {
  const { signUp, signIn, requestPasswordReset } = useStore();
  const [mode, setMode] = useState<"signup" | "signin" | "forgot">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "forgot") {
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
      setBusy(true);
      const res = await requestPasswordReset(email.trim());
      setBusy(false);
      if (res.error) setError(res.error);
      else setNotice("Password reset email sent — check your inbox and click the link.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const res =
      mode === "signup"
        ? await signUp(name.trim(), email.trim(), password, referralCode.trim())
        : await signIn(email.trim(), password);
    setBusy(false);
    if (res.error) {
      if (mode === "signup" && res.error.toLowerCase().includes("verify")) setNotice(res.error);
      else setError(res.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 od-pop-in">
        <div className="text-3xl font-bold text-brand-600 mb-1">OptiDoerApp</div>
        <p className="text-slate-500 mb-6">Notes · Calendar · Reminders — with AI event creation</p>

        {mode === "signup" && (
          <div className="rounded-lg bg-brand-50 text-brand-800 text-sm p-3 mb-6">
            Sign up to start your <b>{TRIAL_DAYS}-day full-feature free trial</b> — no card required.
          </div>
        )}

        {mode !== "forgot" && (
          <div className="flex gap-2 mb-5 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setNotice(null);
              }}
              className={`px-3 py-1.5 rounded-lg ${mode === "signup" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setNotice(null);
              }}
              className={`px-3 py-1.5 rounded-lg ${mode === "signin" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Sign in
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="mb-5 text-sm text-slate-600">
            Enter the email you signed up with and we'll send you a password reset link.
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="Your name"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="you@example.com"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="At least 6 characters"
              />
            </div>
          )}
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Referral code <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="Got an invite code? Enter it for a 45-day trial"
              />
            </div>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setNotice(null);
              }}
              className="text-xs text-brand-600 hover:underline"
            >
              Forgot password?
            </button>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setNotice(null);
              }}
              className="text-xs text-slate-500 hover:underline"
            >
              ← Back to sign in
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-600">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 hover:bg-brand-700 transition disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "signup" ? "Start free trial" : mode === "signin" ? "Sign in" : "Send reset email"}
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-4">Your data is stored in the cloud (Supabase) — sign in on any device to see it.</p>
      </div>
    </div>
  );
}

/** Shown when the user clicks the link in the password-reset email and lands back here. */
export function ResetPasswordForm() {
  const { updatePassword } = useStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.error) setError(res.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 od-pop-in">
        <div className="text-2xl font-bold text-slate-800 mb-1">Set a new password</div>
        <p className="text-slate-500 mb-6 text-sm">Choose a new password for your account.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Type it again"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 hover:bg-brand-700 transition disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Supabase not configured: keep the original local-only demo mode (data stays in this browser). */
function LocalOnlyForm() {
  const { createAccount } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 od-pop-in">
        <div className="text-3xl font-bold text-brand-600 mb-1">OptiDoerApp</div>
        <p className="text-slate-500 mb-6">Notes · Calendar · Reminders — with AI event creation</p>

        <div className="rounded-lg bg-brand-50 text-brand-800 text-sm p-3 mb-6">
          Sign up to start your <b>{TRIAL_DAYS}-day full-feature free trial</b> — no card required.
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !email.trim()) return;
            createAccount(name.trim(), email.trim());
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 text-white font-medium py-2.5 hover:bg-brand-700 transition"
          >
            Start free trial
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-4">
          MVP demo: account info is only stored in this browser (localStorage), never uploaded.
        </p>
      </div>
    </div>
  );
}
