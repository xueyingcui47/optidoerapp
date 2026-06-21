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

/**
 * 时区安全的日期工具——专给"服务端代码需要按某个具体时区（通常是用户的浏览器时区，
 * 由前端显式上报）计算日期/时间"这种场景用，不依赖 Node 进程自己的本地时区
 * （Vercel 上永远是 UTC，跟用户实际所在时区八成不一样）。
 */

/** 某个时刻在指定时区下显示出来的"日历日期"（年/月[0-索引]/日）。 */
export function dateComponentsInZone(d: Date, tz: string): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: +map.year, m: +map.month - 1, day: +map.day };
}

/** 给定年/月[0-索引]/日，在某个时区下加减天数后的日历日期（纯日历运算，不涉及任何具体时刻）。 */
export function addDaysToYMD(y: number, m: number, day: number, deltaDays: number): { y: number; m: number; day: number } {
  const d = new Date(Date.UTC(y, m, day + deltaDays));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}

/** 给定年/月[0-索引]/日是星期几（0=周日）——纯日历运算。 */
export function weekdayOfYMD(y: number, m: number, day: number): number {
  return new Date(Date.UTC(y, m, day)).getUTCDay();
}

/** 把"某个时区下的 年/月[0-索引]/日 时:分"换算成真正对应的 UTC 时刻。 */
export function zonedTimeToUtc(y: number, m: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const displayedAsUtcMs = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  const diff = guess.getTime() - displayedAsUtcMs;
  return new Date(guess.getTime() + diff);
}

export function describeOffset(min: number): string {
  if (min === 0) return "At start time";
  if (min < 60) return `${min} min before`;
  if (min < 1440) return `${min / 60} hr before`;
  return `${min / 1440} day(s) before`;
}
