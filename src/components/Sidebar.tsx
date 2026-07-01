"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Today", short: "Today", icon: "🏠" },
  { href: "/notes", label: "Notes", short: "Notes", icon: "📝" },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "📅" },
  { href: "/reminders", label: "Reminders", short: "Alerts", icon: "🔔" },
  { href: "/import", label: "Import/Export", short: "Import", icon: "📥" },
  { href: "/settings", label: "Settings", short: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { state } = useStore();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 border-r border-slate-200 bg-white flex-col">
        <div className="px-5 py-4 text-xl font-bold text-brand-600">OptiDoerApp</div>
        <nav className="flex-1 px-2 space-y-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        {state.account && (
          <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
            <div className="font-medium text-slate-700 truncate">{state.account.name}</div>
            <div className="truncate">{state.account.email}</div>
            {state.account.subscribed && (
              <div className="mt-1 inline-block rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5">
                Subscribed · {state.account.plan === "tier2" ? "AI Plan" : "Standard Plan"}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <span className="text-lg font-bold text-brand-600">OptiDoerApp</span>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                // 手机上点已经激活的 Calendar 标签：回到纯网格视图（收起 WeekAgenda）。
                // CalendarPage 监听这个事件并把 selectedDay 清掉。
                if (item.href === "/calendar" && active) {
                  window.dispatchEvent(new Event("calendar:reset"));
                }
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-brand-600" : "text-slate-500"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
