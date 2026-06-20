"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Today", icon: "🏠" },
  { href: "/notes", label: "Notes", icon: "📝" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/reminders", label: "Reminders", icon: "🔔" },
  { href: "/import", label: "Import/Export", icon: "📥" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { state } = useStore();

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-5 py-4 text-xl font-bold text-brand-600">OptiDoerApp</div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
  );
}
