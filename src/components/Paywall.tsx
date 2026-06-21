"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { isNativeApp } from "@/lib/platform";
import { supabase } from "@/lib/supabaseClient";
import { startCheckout, stripeEnabled } from "@/lib/stripeClient";

// Hard paywall (SOW 4.5): locks core features once the trial ends without a subscription,
// keeping only "view + subscribe" access so data is never held hostage.

// First-month promo for monthly billing (reverts to the normal monthly price after).
export const FIRST_MONTH_PROMO_PRICE = 0;

export const PRICING = {
  tier1: { label: "Standard Membership", monthly: 2.99, yearly: 29.99 },
  tier2: { label: "Enhanced Membership", monthly: 5.99, yearly: 59.99 },
} as const;

export const FEATURES: Record<keyof typeof PRICING, string[]> = {
  tier1: ["Notes", "Calendar", "Daily reminder"],
  tier2: ["Notes", "Calendar", "Daily reminder", "AI: just type it, we build the event"],
};

function yearlyDiscountPct(monthly: number, yearly: number): number {
  const fullYearAtMonthly = monthly * 12;
  return Math.round((1 - yearly / fullYearAtMonthly) * 100);
}

export function PlanCard({
  tier,
  highlight,
  onSubscribe,
}: {
  tier: keyof typeof PRICING;
  highlight?: boolean;
  onSubscribe: (tier: "tier1" | "tier2", billing: "monthly" | "yearly") => void;
}) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const p = PRICING[tier];
  const price = billing === "monthly" ? p.monthly : p.yearly;
  const pct = yearlyDiscountPct(p.monthly, p.yearly);

  const handleChoose = async () => {
    if (!stripeEnabled || !supabase) {
      onSubscribe(tier, billing);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      onSubscribe(tier, billing);
      return;
    }
    setBusy(true);
    try {
      await startCheckout(tier, billing, token);
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col ${
        highlight ? "border-brand-400 ring-1 ring-brand-200" : "border-slate-200"
      }`}
    >
      <div className="font-semibold text-slate-800">{p.label}</div>

      <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-xs mt-3 self-start">
        <button
          onClick={() => setBilling("monthly")}
          className={`px-2.5 py-1 rounded-md ${billing === "monthly" ? "bg-brand-600 text-white" : "text-slate-600"}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling("yearly")}
          className={`px-2.5 py-1 rounded-md flex items-center gap-1 ${
            billing === "yearly" ? "bg-brand-600 text-white" : "text-slate-600"
          }`}
        >
          Yearly
          {pct > 0 && (
            <span
              className={`text-[10px] font-semibold rounded px-1 ${
                billing === "yearly" ? "bg-white/25" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {pct}% OFF
            </span>
          )}
        </button>
      </div>

      <div className="mt-3">
        {billing === "monthly" ? (
          <span className="text-3xl font-bold">First Month Free</span>
        ) : (
          <>
            <span className="text-3xl font-bold">${price}</span>
            <span className="text-slate-500 text-sm">/year</span>
          </>
        )}
      </div>
      {billing === "monthly" && <div className="text-xs text-slate-400 mt-0.5">${price}/mo after that</div>}
      {billing === "yearly" && (
        <div className="text-xs text-slate-400 mt-0.5">≈ ${(price / 12).toFixed(2)}/mo</div>
      )}

      <ul className="text-sm text-slate-600 mt-4 space-y-1.5 flex-1">
        {FEATURES[tier].map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <span className="text-emerald-500">✓</span> {f}
          </li>
        ))}
      </ul>

      {isNativeApp() ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs text-slate-500">
          Subscribe at optidoerapp.com
        </div>
      ) : (
        <button
          onClick={handleChoose}
          disabled={busy}
          className={`mt-4 rounded-lg font-medium py-2 transition disabled:opacity-50 ${
            highlight
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "border border-slate-300 text-slate-700 hover:bg-slate-100"
          }`}
        >
          {busy ? "Redirecting…" : "Choose this plan"}
        </button>
      )}
    </div>
  );
}

export function Paywall() {
  const { subscribe } = useStore();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-slate-800">Your trial has ended</div>
          <p className="text-slate-500 mt-1">
            Subscribe to unlock everything again. Your data is safe and waiting for you.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <PlanCard tier="tier1" onSubscribe={subscribe} />
          <PlanCard tier="tier2" highlight onSubscribe={subscribe} />
        </div>

        <p className="text-xs text-slate-400 text-center mt-5">
          {stripeEnabled
            ? "Test mode — use Stripe's test card 4242 4242 4242 4242, any future date, any CVC."
            : "MVP demo: this simulates a successful subscription — no real payment yet (Stripe / Apple IAP / Google Play is Phase 2)."}
        </p>
      </div>
    </div>
  );
}
