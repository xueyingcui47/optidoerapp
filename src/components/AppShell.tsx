"use client";

import { useStore } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { TrialBanner } from "./TrialBanner";
import { Onboarding, ResetPasswordForm } from "./Onboarding";
import { Paywall } from "./Paywall";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, state, locked, recovery } = useStore();

  // 等待 localStorage 读取完成，避免水合闪烁。
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  // 用户点了「重置密码」邮件里的链接回到本站：无论是否已登录，先让他设置新密码。
  if (recovery) return <ResetPasswordForm />;

  if (!state.account) return <Onboarding />;
  if (locked) return <Paywall />;

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TrialBanner />
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
