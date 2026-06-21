import type { ParsedEventDraft } from "./types";
import { addDaysToYMD, dateComponentsInZone, weekdayOfYMD, zonedTimeToUtc } from "./date";

// 本地启发式自然语言解析器。
// 这是 AI 功能的「mock 引擎」：无需任何外部服务即可把
// 「明天下午3点开会」「next monday 10am-11am sync」之类的文本变成事件草稿。
// 接入真正的 Claude 后（设置了 ANTHROPIC_API_KEY），API 路由会优先调用 Claude，
// 仅在未配置 key 或调用失败时回退到这里。
//
// 时区注意：这个函数可能跑在服务端（Vercel，进程时区固定是 UTC），不能用 Date 的
// setHours/setDate 这类依赖"进程本地时区"的方法去拼日期——那样拼出来的会是 UTC 时间，
// 不是调用方真正想要的时区。所以这里全程用 date.ts 里的时区安全工具
// （dateComponentsInZone / addDaysToYMD / weekdayOfYMD / zonedTimeToUtc）做日历运算，
// 由调用方显式传入 tz（前端上报浏览器自己的时区）。

type YMD = { y: number; m: number; day: number };

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, 周日: 0, 星期日: 0, 礼拜日: 0,
  monday: 1, mon: 1, 周一: 1, 星期一: 1, 礼拜一: 1,
  tuesday: 2, tue: 2, tues: 2, 周二: 2, 星期二: 2, 礼拜二: 2,
  wednesday: 3, wed: 3, 周三: 3, 星期三: 3, 礼拜三: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, 周四: 4, 星期四: 4, 礼拜四: 4,
  friday: 5, fri: 5, 周五: 5, 星期五: 5, 礼拜五: 5,
  saturday: 6, sat: 6, 周六: 6, 星期六: 6, 礼拜六: 6,
};

interface TimePart {
  hour: number;
  minute: number;
}

/** 解析单个时间标记，如 "3pm" "15:00" "10:30am" "下午3点" "上午10点半"。 */
function parseTime(raw: string): TimePart | null {
  let s = raw.toLowerCase().trim();

  // 带 am/pm 的优先按英文解析——否则下面中文规则里的 "[点:：]" 会把英文冒号也当成
  // "点" 提前抢先匹配掉（比如 "5:30pm" 被当成"5点30"），白白丢掉 am/pm 信息。
  if (/am|pm/.test(s)) {
    const enAmPm = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (enAmPm) {
      let hour = parseInt(enAmPm[1], 10);
      const minute = enAmPm[2] ? parseInt(enAmPm[2], 10) : 0;
      if (enAmPm[3] === "pm" && hour < 12) hour += 12;
      if (enAmPm[3] === "am" && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
    }
  }

  // 中文「下午/晚上/中午」+ 数字点
  const zh = s.match(/(上午|早上|凌晨|下午|晚上|中午)?\s*(\d{1,2})\s*[点:：]\s*(\d{1,2}|半)?/);
  if (zh) {
    let hour = parseInt(zh[2], 10);
    const minStr = zh[3];
    let minute = minStr === "半" ? 30 : minStr ? parseInt(minStr, 10) : 0;
    const period = zh[1];
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
    if (period === "中午") hour = 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  // 英文 3pm / 3:30pm / 15:00 / 10 am
  const en = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (en && (en[3] || s.includes(":"))) {
    let hour = parseInt(en[1], 10);
    const minute = en[2] ? parseInt(en[2], 10) : 0;
    const ampm = en[3];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }
  return null;
}

/** 根据文本推断目标日期（只定日历日期，不含时间）。 */
function parseDate(text: string, base: YMD): { date: YMD; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  if (/明天|tomorrow/.test(lower)) {
    matched.push("tomorrow");
    return { date: addDaysToYMD(base.y, base.m, base.day, 1), matched };
  }
  if (/后天/.test(lower)) {
    matched.push("后天");
    return { date: addDaysToYMD(base.y, base.m, base.day, 2), matched };
  }
  if (/今天|today|tonight|今晚/.test(lower)) {
    matched.push("today");
    return { date: base, matched };
  }

  const inDays = lower.match(/in (\d+) days?/);
  if (inDays) {
    matched.push(inDays[0]);
    return { date: addDaysToYMD(base.y, base.m, base.day, parseInt(inDays[1], 10)), matched };
  }

  // 工作日名称（可带 next / 下）
  for (const [word, dow] of Object.entries(WEEKDAYS)) {
    if (lower.includes(word)) {
      matched.push(word);
      const isNext = new RegExp(`(next|下个?周?|下)\\s*${word}`).test(lower);
      const todayDow = weekdayOfYMD(base.y, base.m, base.day);
      let diff = (dow - todayDow + 7) % 7;
      if (diff === 0) diff = 7; // 同名当天默认指下一个
      if (isNext && diff <= 7) diff += diff <= 0 ? 7 : 0;
      return { date: addDaysToYMD(base.y, base.m, base.day, diff), matched };
    }
  }

  // 默认：今天
  return { date: base, matched };
}

/** 清理标题：移除已识别的时间/日期关键词。 */
function cleanTitle(text: string): string {
  let t = text;
  const noise = [
    /在?\s*(明天|后天|今天|今晚|tomorrow|today|tonight)/gi,
    /(next|下个?周?|下)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/gi,
    /(周|星期|礼拜)[一二三四五六日]/g,
    /(上午|早上|凌晨|下午|晚上|中午)?\s*\d{1,2}\s*[点:：]\s*(\d{1,2}|半)?(分)?/g,
    /\d{1,2}(:\d{2})?\s*(am|pm)/gi,
    /(from|at|到|至|-|–|~|，|,)/gi,
    /in \d+ days?/gi,
  ];
  for (const re of noise) t = t.replace(re, " ");
  t = t.replace(/\s+/g, " ").trim();
  // 去掉常见前缀动词残留的空壳
  return t || "New event";
}

export function mockParseEvent(text: string, nowISO?: string, tz = "UTC"): ParsedEventDraft {
  const now = nowISO ? new Date(nowISO) : new Date();
  const todayYMD = dateComponentsInZone(now, tz);
  const { date } = parseDate(text, todayYMD);

  // 找出时间标记（可能是一个或两个，构成时间段）
  const timeMatches: TimePart[] = [];
  // 英文时间
  const enTimes = text.toLowerCase().match(/\d{1,2}(?::\d{2})?\s*(am|pm)|\d{1,2}:\d{2}/g) || [];
  for (const m of enTimes) {
    const p = parseTime(m);
    if (p) timeMatches.push(p);
  }
  // 中文时间
  const zhTimes = text.match(/(上午|早上|凌晨|下午|晚上|中午)?\s*\d{1,2}\s*[点:：]\s*(\d{1,2}|半)?/g) || [];
  for (const m of zhTimes) {
    const p = parseTime(m);
    if (p) timeMatches.push(p);
  }

  let start: Date | null = null;
  let end: Date | null = null;
  let allDay = false;
  let confidence: ParsedEventDraft["confidence"] = "medium";
  let note: string | undefined;

  if (timeMatches.length >= 1) {
    start = zonedTimeToUtc(date.y, date.m, date.day, timeMatches[0].hour, timeMatches[0].minute, tz);
    if (timeMatches.length >= 2) {
      end = zonedTimeToUtc(date.y, date.m, date.day, timeMatches[1].hour, timeMatches[1].minute, tz);
      if (end <= start) {
        const next = addDaysToYMD(date.y, date.m, date.day, 1);
        end = zonedTimeToUtc(next.y, next.m, next.day, timeMatches[1].hour, timeMatches[1].minute, tz);
      }
      confidence = "high";
    } else {
      end = new Date(start.getTime() + 60 * 60 * 1000);
      note = "No end time given, defaulting to a 1-hour duration. ";
      confidence = "high";
    }
  } else {
    // 没有时间 → 全天事件
    start = zonedTimeToUtc(date.y, date.m, date.day, 0, 0, tz);
    end = zonedTimeToUtc(date.y, date.m, date.day, 23, 59, tz);
    allDay = true;
    confidence = "low";
    note = "No specific time detected, treating this as an all-day event. ";
  }

  return {
    title: cleanTitle(text),
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    location: null,
    description: null,
    allDay,
    confidence,
    note,
  };
}
