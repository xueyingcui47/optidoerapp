// 事件标记颜色：现代、低饱和度的色板，避免与文字/UI 主色冲突。
// "已完成" 状态会覆盖标记颜色，统一显示为浅灰色。

export interface EventColorOption {
  key: string;
  label: string;
  /** 颜色选择器里的圆点样式。 */
  dot: string;
  /** 月视图小色块样式。 */
  pill: string;
  /** 周/日视图时间块样式。 */
  block: string;
}

export const EVENT_COLOR_OPTIONS: EventColorOption[] = [
  { key: "default", label: "Default", dot: "bg-brand-400", pill: "bg-brand-100 text-brand-800 hover:bg-brand-200", block: "bg-brand-200 text-brand-900 hover:bg-brand-300" },
  { key: "sky", label: "Sky", dot: "bg-sky-400", pill: "bg-sky-100 text-sky-800 hover:bg-sky-200", block: "bg-sky-200 text-sky-900 hover:bg-sky-300" },
  { key: "emerald", label: "Emerald", dot: "bg-emerald-400", pill: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200", block: "bg-emerald-200 text-emerald-900 hover:bg-emerald-300" },
  { key: "amber", label: "Amber", dot: "bg-amber-400", pill: "bg-amber-100 text-amber-800 hover:bg-amber-200", block: "bg-amber-200 text-amber-900 hover:bg-amber-300" },
  { key: "rose", label: "Rose", dot: "bg-rose-400", pill: "bg-rose-100 text-rose-800 hover:bg-rose-200", block: "bg-rose-200 text-rose-900 hover:bg-rose-300" },
  { key: "violet", label: "Violet", dot: "bg-violet-400", pill: "bg-violet-100 text-violet-800 hover:bg-violet-200", block: "bg-violet-200 text-violet-900 hover:bg-violet-300" },
  { key: "slate", label: "Slate", dot: "bg-slate-400", pill: "bg-slate-200 text-slate-700 hover:bg-slate-300", block: "bg-slate-300 text-slate-800 hover:bg-slate-400" },
];

const COMPLETED_PILL = "bg-slate-100 text-slate-500 hover:bg-slate-200";
const COMPLETED_BLOCK = "bg-slate-100 text-slate-500 hover:bg-slate-200";

function findColor(key?: string): EventColorOption {
  return EVENT_COLOR_OPTIONS.find((o) => o.key === key) ?? EVENT_COLOR_OPTIONS[0];
}

export function eventPillClasses(ev: { completed: boolean; color?: string }): string {
  if (ev.completed) return COMPLETED_PILL;
  return findColor(ev.color).pill;
}

export function eventBlockClasses(ev: { completed: boolean; color?: string }): string {
  if (ev.completed) return COMPLETED_BLOCK;
  return findColor(ev.color).block;
}
