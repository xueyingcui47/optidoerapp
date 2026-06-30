"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { PRICING, PlanCard } from "@/components/Paywall";
import { supabase, supabaseEnabled } from "@/lib/supabaseClient";
import { isNativeApp } from "@/lib/platform";
import { openBillingPortal, stripeEnabled } from "@/lib/stripeClient";
import { AI_EVENT_CREATE_ENABLED } from "@/lib/featureFlags";

export default function SettingsPage() {
  const {
    state,
    updateSettings,
    clearAiLog,
    resetAccount,
    trialLeft,
    subscribe,
    cancelPendingBillingChange,
    cancelSubscription,
  } = useStore();
  const s = state.settings;
  const account = state.account;
  const inApp = isNativeApp();
  const usesStripe = stripeEnabled && !!account?.stripeSubscriptionId;
  const [portalBusy, setPortalBusy] = useState(false);
  const inFirstMonth =
    !!account?.subscribedAt &&
    account.billing === "monthly" &&
    Date.now() - new Date(account.subscribedAt).getTime() < 30 * 86_400_000;

  const handleManageBilling = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setPortalBusy(true);
    try {
      await openBillingPortal(token);
    } catch (err) {
      alert((err as Error).message);
      setPortalBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>

      {/* Account / subscription */}
      <Section title="Account & subscription">
        <Row label="Name" value={state.account?.name} />
        <Row label="Email" value={state.account?.email} />
        <Row
          label="Subscription"
          value={
            account?.subscribed
              ? `Subscribed · ${PRICING[account.plan ?? "tier1"].label} · ${
                  account.billing === "yearly"
                    ? `Yearly $${PRICING[account.plan ?? "tier1"].yearly}/yr`
                    : inFirstMonth
                    ? `Monthly (first month free, then $${PRICING[account.plan ?? "tier1"].monthly}/mo)`
                    : `Monthly $${PRICING[account.plan ?? "tier1"].monthly}/mo`
                }`
              : `Trial · ${trialLeft} day${trialLeft === 1 ? "" : "s"} left`
          }
        />
        {account?.subscribed ? (
          <div className="py-3 space-y-2">
            {account.pendingBilling && account.pendingBillingEffectiveAt && (
              <div className="rounded-lg bg-amber-50 text-amber-800 text-sm p-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Scheduled: switching to <strong>monthly billing</strong> on{" "}
                  {fmtDate(new Date(account.pendingBillingEffectiveAt))} (when your current yearly term ends).
                </span>
                <button onClick={cancelPendingBillingChange} className="text-amber-800 underline shrink-0">
                  Cancel this
                </button>
              </div>
            )}
            {inApp ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                To change your plan or billing, visit optidoerapp.com on the web.
              </div>
            ) : usesStripe ? (
              <button
                onClick={handleManageBilling}
                disabled={portalBusy}
                className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
              >
                {portalBusy ? "Redirecting…" : "Manage billing (switch plan, change billing, cancel)"}
              </button>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => subscribe(account.plan === "tier2" ? "tier1" : "tier2", account.billing ?? "monthly")}
                    className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                  >
                    Switch to {account.plan === "tier2" ? PRICING.tier1.label : PRICING.tier2.label}
                  </button>
                  {account.billing === "yearly" ? (
                    !account.pendingBilling && (
                      <button
                        onClick={() => subscribe(account.plan ?? "tier1", "monthly")}
                        className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                      >
                        Switch to monthly billing (at term end)
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => subscribe(account.plan ?? "tier1", "yearly")}
                      className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                    >
                      Switch to yearly billing
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (confirm("Cancel your subscription? You'll lose access to paid features immediately.")) {
                      cancelSubscription();
                    }
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Cancel subscription
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="py-3 space-y-3">
            <div className="text-xs text-slate-500">Subscribe anytime — no need to wait for your trial to end.</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <PlanCard tier="tier1" onSubscribe={subscribe} />
              <PlanCard tier="tier2" highlight onSubscribe={subscribe} />
            </div>
            <Toggle
              label="(Dev) Simulate trial expiration → trigger hard paywall"
              checked={s.simulateTrialExpired}
              onChange={(v) => updateSettings({ simulateTrialExpired: v })}
            />
          </div>
        )}
      </Section>

      {/* Referral */}
      {account?.referralCode && (
        <Section title="Invite friends">
          <div className="py-2 space-y-3">
            <p className="text-sm text-slate-600">
              Share your code — anyone who signs up with it gets a <strong>45-day trial</strong>{" "}
              instead of the usual 15. {account.subscribed
                ? "Since you're a subscriber, you'll also get a free month added to your membership for every friend who joins."
                : "Subscribe to also start earning a free month of membership for every friend who joins using your code."}
            </p>
            <div className="flex items-center gap-2">
              <code className="text-base font-mono font-semibold bg-slate-100 text-slate-800 rounded-lg px-3 py-1.5">
                {account.referralCode}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(account.referralCode)}
                className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                Copy
              </button>
            </div>
            {account.membershipCreditUntil && new Date(account.membershipCreditUntil) > new Date() && (
              <p className="text-xs text-emerald-600">
                Referral credits have your membership covered through{" "}
                {new Date(account.membershipCreditUntil).toLocaleDateString()}.
              </p>
            )}
          </div>
        </Section>
      )}

      {/* AI */}
      <Section title="AI features">
        {AI_EVENT_CREATE_ENABLED && (
          <Toggle
            label="Natural-language event creation"
            desc='Type "lunch with Sam tomorrow at noon" in the calendar to auto-generate an event.'
            checked={s.aiNlEventEnabled}
            onChange={(v) => updateSettings({ aiNlEventEnabled: v })}
          />
        )}
        <div className="flex items-start justify-between py-2 opacity-60">
          <div>
            <div className="text-sm text-slate-700">Smart schedule suggestions</div>
            <div className="text-xs text-slate-500">Phase 2 feature, not yet available in the MVP (privacy-sensitive, off by default).</div>
          </div>
          <span className="text-xs rounded bg-slate-100 text-slate-500 px-2 py-0.5">Phase 2</span>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-slate-700">My AI log (recent)</div>
            {state.aiLog.length > 0 && (
              <button onClick={clearAiLog} className="text-xs text-red-500 hover:underline">
                Clear
              </button>
            )}
          </div>
          {state.aiLog.length === 0 ? (
            <p className="text-xs text-slate-400">No AI calls yet.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-auto">
              {state.aiLog.map((e) => (
                <li key={e.id} className="text-xs text-slate-600 flex justify-between gap-2">
                  <span className="truncate">
                    {fmtDateTime(new Date(e.at))} · {e.engine === "claude" ? "Claude" : "mock"} ·{" "}
                    {e.inputChars} chars → {e.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notification preferences">
        <Toggle
          label="Device push"
          checked={s.channels.push}
          onChange={(v) => updateSettings({ channels: { ...s.channels, push: v } })}
        />
        <Toggle
          label="Email reminders"
          checked={s.channels.email}
          onChange={(v) => updateSettings({ channels: { ...s.channels, email: v } })}
        />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-slate-700">Event reminder</span>
          <select
            value={s.defaultReminderOffset}
            onChange={(e) => updateSettings({ defaultReminderOffset: parseInt(e.target.value, 10) })}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value={-1}>None</option>
            <option value={0}>At start time</option>
            <option value={10}>10 minutes before</option>
            <option value={60}>1 hour before</option>
            <option value={1440}>1 day before</option>
          </select>
        </div>
        <p className="text-xs text-slate-400 -mt-1 pb-1">Applies to all events — there's no longer a per-event override.</p>
      </Section>

      <Section title="Danger zone">
        <button
          onClick={() => {
            const msg = supabaseEnabled
              ? "Sign out? Your data is stored in the cloud — sign back in anytime to get it back."
              : "Clear all local data and sign out? This cannot be undone.";
            if (confirm(msg)) resetAccount();
          }}
          className="text-sm text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
        >
          {supabaseEnabled ? "Sign out" : "Delete account & clear local data"}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-700 mb-3">{title}</h2>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <div>
        <div className="text-sm text-slate-700">{label}</div>
        {desc && <div className="text-xs text-slate-500">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full transition relative ${
          checked ? "bg-brand-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
