"use client";

import { useStore } from "@/lib/store";

export function TrialBanner() {
  const { state, trialLeft } = useStore();
  if (!state.account || state.account.subscribed) return null;

  const urgent = trialLeft <= 3;
  return (
    <div
      className={`text-sm px-4 py-2 text-center ${
        urgent ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-800"
      }`}
    >
      <b>{trialLeft}</b> day{trialLeft === 1 ? "" : "s"} left in your free trial
      {urgent && " — subscribe soon to avoid losing access."}
    </div>
  );
}
