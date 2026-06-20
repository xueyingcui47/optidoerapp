"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

// Hard paywall (SOW 4.5): locks core features once the trial ends without a subscription,
// keeping only "view + subscribe" access so data is never held hostage.

// First-month promo price for monthly billing (reverts to the normal monthly price after).
export const FIRST_MONTH_PROMO_PRICE = 0.01;

export const PRICING = {
  tier1: { label: "Standard (no AI)", monthly: 2.99, yearly: 29.99 },
  tier2: { label: "AI Plan (with AI)", monthly: 5.99, yearly: 59.99 },
} as const;

export function Paywall() {
  const { subscribe } = useStore();
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold text-slate-800">Your trial has ended</div>
          <p className="text-slate-500 mt-1">
            Subscribe to unlock everything again. Your data is safe and waiting for you.
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-lg border border-slate-300 p-1 text-sm">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-1.5 rounded-md ${
                billing === "monthly" ? "bg-brand-600 text-white" : "text-slate-600"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-1.5 rounded-md ${
                billing === "yearly" ? "bg-brand-600 text-white" : "text-slate-600"
              }`}
            >
              Yearly (better value)
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {(["tier1", "tier2"] as const).map((tier) => {
            const p = PRICING[tier];
            const price = billing === "monthly" ? p.monthly : p.yearly;
            return (
              <div
                key={tier}
                className={`rounded-xl border p-5 flex flex-col ${
                  tier === "tier2"
                    ? "border-brand-400 ring-1 ring-brand-200"
                    : "border-slate-200"
                }`}
              >
                <div className="font-semibold text-slate-800">{p.label}</div>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    ${billing === "monthly" ? FIRST_MONTH_PROMO_PRICE.toFixed(2) : price}
                  </span>
                  <span className="text-slate-500 text-sm">
                    /{billing === "monthly" ? "first month" : "year"}
                  </span>
                </div>
                {billing === "monthly" && (
                  <div className="text-xs text-slate-400 mt-0.5">${price}/mo after that</div>
                )}
                <ul className="text-sm text-slate-600 mt-3 space-y-1 flex-1">
                  <li>· Notes + Calendar + Reminders</li>
                  {tier === "tier2" && <li>· AI natural-language event creation</li>}
                </ul>
                <button
                  onClick={() => subscribe(tier, billing)}
                  className="mt-4 rounded-lg bg-brand-600 text-white font-medium py-2 hover:bg-brand-700 transition"
                >
                  Choose this plan
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 text-center mt-5">
          MVP demo: this simulates a successful subscription — no real payment yet (Stripe / Apple IAP / Google Play is Phase 2).
        </p>
      </div>
    </div>
  );
}
