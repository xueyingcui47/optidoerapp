// 轻量日期工具，避免引入额外依赖。

export const MS_DAY = 86_400_000;
export const TRIAL_DAYS = 15;

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** 周一作为一周起点。 */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7; // 周一=0
  return addDays(r, -day);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

/** 把 Date 转成 datetime-local input 所需的本地字符串。 */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(v: string): Date {
  return new Date(v);
}

/**
 * Parse a date-only string ("YYYY-MM-DD") as local midnight, not UTC midnight.
 * `new Date("YYYY-MM-DD")` is parsed as UTC per spec, which silently shifts the
 * calendar date back a day in any negative-UTC-offset timezone (all of the US) —
 * this is what an all-day event's date picker needs instead.
 */
export function parseLocalDateOnly(v: string): Date {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(v);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

/** 试用剩余天数（向上取整，最少 0）。 */
export function trialDaysLeft(trialStartedAt: string): number {
  const start = new Date(trialStartedAt).getTime();
  const elapsed = Date.now() - start;
  return Math.max(0, TRIAL_DAYS - Math.floor(elapsed / MS_DAY));
}

export function describeOffset(min: number): string {
  if (min === 0) return "At start time";
  if (min < 60) return `${min} min before`;
  if (min < 1440) return `${min / 60} hr before`;
  return `${min / 1440} day(s) before`;
}
