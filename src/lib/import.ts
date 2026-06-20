import type { CalendarEvent, Note } from "./types";

// 导入相关：CSV 解析、表头自适应检测、智能字段映射、.ics 解析、去重。
// 对应 SOW 4.6。目标是「自适应各种导出文件」（TickTick / Todoist / Google / 通用 CSV）。

export type ImportEventDraft = Pick<
  CalendarEvent,
  "title" | "start" | "end" | "location" | "description" | "allDay"
>;
export type ImportNoteDraft = Pick<Note, "title" | "contentHtml" | "tags">;

/* ───────────────── CSV 解析 ───────────────── */

/** 解析 CSV，支持引号包裹、引号内逗号/换行、双引号转义、CRLF。返回所有行（不区分表头）。 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // 去 BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

/* ───────────────── 字段别名（归一化匹配） ───────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-/.:：]+/g, "").trim();

// 每个目标字段对应一组「归一化后的别名」。覆盖中英 + 常见工具导出列名。
const ALIASES: Record<string, string[]> = {
  title: ["title", "标题", "subject", "summary", "name", "task", "任务", "事项", "todo", "事件", "主题"],
  content: ["content", "内容", "body", "正文", "text", "note", "notes", "description", "备注", "说明", "details", "描述"],
  tags: ["tags", "标签", "labels", "label", "category", "categories", "分类", "label/tag"],
  start: ["startdate", "start", "starttime", "开始", "开始时间", "dtstart", "begin", "起始"],
  due: ["duedate", "due", "deadline", "截止", "到期", "endtime", "end", "enddate", "结束", "dtend", "结束时间", "date", "日期", "时间"],
  allDay: ["isallday", "allday", "全天", "全天事件"],
  kind: ["kind", "type", "类型", "itemtype", "条目类型"],
  location: ["location", "地点", "place", "位置", "address", "地址"],
  priority: ["priority", "优先级"],
  status: ["status", "状态"],
  reminder: ["reminder", "提醒", "remind"],
};

/** 在表头里找某个目标字段对应的列下标，找不到返回 -1。 */
function findCol(headersNorm: string[], field: string): number {
  const cands = ALIASES[field] ?? [norm(field)];
  // 先精确匹配
  for (const c of cands) {
    const i = headersNorm.indexOf(c);
    if (i >= 0) return i;
  }
  // 再子串匹配（如 "taskcontent" 含 "content"）
  for (const c of cands) {
    const i = headersNorm.findIndex((h) => h.includes(c) || c.includes(h));
    if (i >= 0 && headersNorm[i].length > 1) return i;
  }
  return -1;
}

/* ───────────────── 表头自适应检测 ───────────────── */

export interface DetectedTable {
  headers: string[];
  rows: string[][];
  headerRowIndex: number;
}

/**
 * 自动定位真正的表头行（跳过 TickTick 之类导出文件开头的 Date/Version/Status 等元数据行）。
 * 评分规则：某一行里有多少单元格能匹配到已知字段别名，匹配最多者即表头。
 */
export function detectTable(allRows: string[][]): DetectedTable {
  const fields = Object.keys(ALIASES);
  let best = { idx: 0, score: -1, cols: 0 };
  const scan = Math.min(allRows.length, 20);

  for (let i = 0; i < scan; i++) {
    const cells = allRows[i];
    if (cells.length < 2) continue; // 元数据行通常只有 1 个单元格
    const hn = cells.map(norm);
    let score = 0;
    for (const f of fields) if (findCol(hn, f) >= 0) score++;
    // 列数越多越像表头（轻微加权）
    const weighted = score * 10 + cells.length;
    if (score >= 2 && weighted > best.score * 10 + best.cols) {
      best = { idx: i, score, cols: cells.length };
    }
  }

  // 没找到像样的表头：退化为「第一行即表头」。
  if (best.score < 0) {
    const headers = allRows[0] ?? [];
    return { headers: headers.map((h) => h.trim()), rows: allRows.slice(1), headerRowIndex: 0 };
  }

  const headers = allRows[best.idx].map((h) => h.trim());
  // 数据行：表头之后、列数与表头接近（>= 一半）的行。
  const rows = allRows
    .slice(best.idx + 1)
    .filter((r) => r.length >= Math.max(2, Math.floor(headers.length / 2)));
  return { headers, rows, headerRowIndex: best.idx };
}

/* ───────────────── 智能映射（自动给手动模式用） ───────────────── */

export function autoGuess(headers: string[], fields: string[]): Record<string, number> {
  const hn = headers.map(norm);
  const map: Record<string, number> = {};
  for (const f of fields) map[f] = findCol(hn, f);
  return map;
}

/* ───────────────── 日期解析 ───────────────── */

/** 宽松解析日期：ISO / "+0000" 偏移 / "YYYY-MM-DD HH:mm" / "YYYY-MM-DD" / 时间戳。 */
export function parseLooseDate(v: string): Date | null {
  let s = (v ?? "").trim();
  if (!s) return null;
  // 把 +0000 / -0700 这类无冒号偏移改成 +00:00（部分浏览器才认）
  s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  // "YYYY-MM-DD HH:mm" → 加 T
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(" ", "T");
  // 纯日期（无时间/时区部分）按本地时间解析，避免 new Date("YYYY-MM-DD") 被当成 UTC 午夜，
  // 在西半球时区会导致全天事件的日期显示提前一天。
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const d = new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ───────────────── 智能导入（核心：自动分类 笔记 / 事件） ───────────────── */

export interface SmartResult {
  events: ImportEventDraft[];
  notes: ImportNoteDraft[];
  skippedGuide: number; // 欢迎/引导示例
  skippedDone: number; // 已完成 / 已归档
  headerRowIndex: number;
  detectedColumns: Record<string, number>;
}

const KIND_NOTE = new Set(["NOTE", "CHECKLIST", "记事", "笔记"]);

/** 是否为工具自带的欢迎/引导条目（靠列表名/帮助链接识别，而非 Kind）。 */
function looksLikeGuide(joined: string): boolean {
  const s = joined.toLowerCase();
  return (
    s.includes("ticktick://") ||
    s.includes("dida365.com/common/user_guide") ||
    s.includes("help.dida365.com") ||
    /👋\s*(欢迎|welcome)/.test(joined)
  );
}

/** 是否已完成 / 已归档（数字 1/2 或文本）。 */
function looksDone(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (s === "1" || s === "2") return true;
  return /complete|done|archiv|finished|完成|归档|已完成|放弃/.test(s);
}

/**
 * 不需要用户手动映射：自动判断每一行是笔记还是事件。
 * - NOTE / CHECKLIST → 笔记。
 * - 其它（TickTick 的 TASK 在导出里写作 TEXT）→ 有日期则事件，否则笔记。
 * - 默认跳过「已完成/已归档」任务与工具自带的欢迎/引导条目。
 */
export function smartImport(
  table: DetectedTable,
  opts: { skipGuide?: boolean; skipDone?: boolean } = {}
): SmartResult {
  const { headers, rows } = table;
  const hn = headers.map(norm);
  const skipGuide = opts.skipGuide ?? true;
  const skipDone = opts.skipDone ?? true;

  let titleIdx = findCol(hn, "title");
  let contentIdx = findCol(hn, "content");
  // 某些工具（如 Todoist）没有独立 title 列，用 content 当标题、description 当正文。
  if (titleIdx < 0 && contentIdx >= 0) {
    titleIdx = contentIdx;
    contentIdx = -1;
  }
  const cols = {
    title: titleIdx,
    content: contentIdx,
    tags: findCol(hn, "tags"),
    start: findCol(hn, "start"),
    due: findCol(hn, "due"),
    allDay: findCol(hn, "allDay"),
    kind: findCol(hn, "kind"),
    location: findCol(hn, "location"),
    status: findCol(hn, "status"),
  };

  const events: ImportEventDraft[] = [];
  const notes: ImportNoteDraft[] = [];
  let skippedGuide = 0;
  let skippedDone = 0;

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  for (const r of rows) {
    const kind = cols.kind >= 0 ? cell(r, cols.kind).toUpperCase() : "";

    if (skipGuide && looksLikeGuide(r.join(" "))) {
      skippedGuide++;
      continue;
    }
    if (skipDone && cols.status >= 0 && looksDone(cell(r, cols.status))) {
      skippedDone++;
      continue;
    }

    const title = cell(r, cols.title);
    const content = cell(r, cols.content);
    if (!title && !content) continue;

    const startD = parseLooseDate(cell(r, cols.start));
    const dueD = parseLooseDate(cell(r, cols.due));
    const hasDate = !!(startD || dueD);
    const allDayFlag = /^(1|true|yes|y|是)$/i.test(cell(r, cols.allDay));

    const isNoteKind = KIND_NOTE.has(kind);
    const asEvent = !isNoteKind && hasDate;

    if (asEvent) {
      const start = startD ?? dueD!;
      let end = startD && dueD ? dueD : new Date(start.getTime() + 60 * 60 * 1000);
      if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
      const desc = [title && content ? content : "", cell(r, cols.location) && `Location: ${cell(r, cols.location)}`]
        .filter(Boolean)
        .join("\n");
      events.push({
        title: title || content.slice(0, 40) || "(untitled)",
        start: start.toISOString(),
        end: end.toISOString(),
        location: cell(r, cols.location),
        description: desc,
        allDay: allDayFlag,
      });
    } else {
      const tags = cell(r, cols.tags)
        .split(/[,，;；]/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);
      // 若把 content 用作了标题，body 取空。
      const body = cols.content >= 0 && cols.content !== cols.title ? content : title && content ? content : "";
      notes.push({
        title: title || content.slice(0, 40) || "(untitled)",
        contentHtml: body ? `<p>${escapeHtml(body)}</p>` : "",
        tags,
      });
    }
  }

  return {
    events,
    notes,
    skippedGuide,
    skippedDone,
    headerRowIndex: table.headerRowIndex,
    detectedColumns: cols,
  };
}

/* ───────────────── 手动映射（高级，可选） ───────────────── */

export function rowsToEventDrafts(
  rows: string[][],
  map: Record<string, number>
): { ok: ImportEventDraft[]; errors: { row: number; reason: string }[] } {
  const ok: ImportEventDraft[] = [];
  const errors: { row: number; reason: string }[] = [];
  rows.forEach((r, idx) => {
    const get = (k: string) => (map[k] >= 0 ? (r[map[k]] ?? "").trim() : "");
    const title = get("title");
    if (!title) {
      errors.push({ row: idx + 1, reason: "Missing title" });
      return;
    }
    const allDay = /^(1|true|yes|y|是)$/i.test(get("allDay"));
    const start = parseLooseDate(get("start"));
    if (!start && !allDay) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setHours(23, 59, 0, 0);
      ok.push({ title, start: today.toISOString(), end: end.toISOString(), location: get("location"), description: get("description"), allDay: true });
      return;
    }
    const startD = start ?? new Date();
    let endD = parseLooseDate(get("end"));
    if (!endD) endD = new Date(startD.getTime() + 60 * 60 * 1000);
    ok.push({ title, start: startD.toISOString(), end: endD.toISOString(), location: get("location"), description: get("description"), allDay });
  });
  return { ok, errors };
}

export function rowsToNoteDrafts(
  rows: string[][],
  map: Record<string, number>
): { ok: ImportNoteDraft[]; errors: { row: number; reason: string }[] } {
  const ok: ImportNoteDraft[] = [];
  const errors: { row: number; reason: string }[] = [];
  rows.forEach((r, idx) => {
    const get = (k: string) => (map[k] >= 0 ? (r[map[k]] ?? "").trim() : "");
    const title = get("title");
    const content = get("content");
    if (!title && !content) {
      errors.push({ row: idx + 1, reason: "Title and content are both empty" });
      return;
    }
    const tags = get("tags").split(/[,，;；]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    ok.push({ title: title || "(untitled)", contentHtml: content ? `<p>${escapeHtml(content)}</p>` : "", tags });
  });
  return { ok, errors };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}

/* ───────────────── ICS (.ics 日历文件) ───────────────── */

export function parseICS(text: string): ImportEventDraft[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: ImportEventDraft[] = [];
  let cur: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) events.push(icsToDraft(cur));
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const value = line.slice(colon + 1);
      const key = left.split(";")[0].toUpperCase();
      cur[key] = value;
      cur[key + "__params"] = left.slice(left.indexOf(";") + 1);
    }
  }
  return events;
}

function parseICSDate(value: string, params = ""): { date: Date | null; allDay: boolean } {
  const isDateOnly = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return { date: null, allDay: true };
    return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (!m) return { date: null, allDay: false };
  if (m[7] === "Z") {
    return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])), allDay: false };
  }
  return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
}

function icsToDraft(e: Record<string, string>): ImportEventDraft {
  const s = parseICSDate(e["DTSTART"] ?? "", e["DTSTART__params"] ?? "");
  const en = parseICSDate(e["DTEND"] ?? "", e["DTEND__params"] ?? "");
  const start = s.date ?? new Date();
  let end = en.date;
  if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);
  if (s.allDay) {
    const endDay = new Date(start);
    endDay.setHours(23, 59, 0, 0);
    end = en.date ?? endDay;
  }
  const unescape = (v?: string) =>
    (v ?? "").replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  return {
    title: unescape(e["SUMMARY"]) || "(untitled)",
    start: start.toISOString(),
    end: end.toISOString(),
    location: unescape(e["LOCATION"]),
    description: unescape(e["DESCRIPTION"]),
    allDay: s.allDay,
  };
}

/* ───────────────── 去重 ───────────────── */

export function dedupEvents(
  drafts: ImportEventDraft[],
  existing: CalendarEvent[]
): { unique: ImportEventDraft[]; duplicates: ImportEventDraft[] } {
  const key = (d: { title: string; start: string }) =>
    `${d.title.trim().toLowerCase()}@${new Date(d.start).toISOString().slice(0, 16)}`;
  const seen = new Set(existing.map((e) => key(e)));
  const unique: ImportEventDraft[] = [];
  const duplicates: ImportEventDraft[] = [];
  for (const d of drafts) {
    const k = key(d);
    if (seen.has(k)) duplicates.push(d);
    else {
      seen.add(k);
      unique.push(d);
    }
  }
  return { unique, duplicates };
}

export function dedupNotes(
  drafts: ImportNoteDraft[],
  existing: Note[]
): { unique: ImportNoteDraft[]; duplicates: ImportNoteDraft[] } {
  const key = (t: string) => t.trim().toLowerCase();
  const seen = new Set(existing.map((n) => key(n.title)));
  const unique: ImportNoteDraft[] = [];
  const duplicates: ImportNoteDraft[] = [];
  for (const d of drafts) {
    const k = key(d.title);
    if (k && seen.has(k)) duplicates.push(d);
    else {
      if (k) seen.add(k);
      unique.push(d);
    }
  }
  return { unique, duplicates };
}

/* ───────────────── CSV 模板 ───────────────── */

export const EVENT_TEMPLATE =
  "title,start,end,location,description,allDay\n" +
  "Team weekly sync,2026-06-22 10:00,2026-06-22 11:00,Conference Room A,Weekly sync-up,false\n" +
  "Project deadline,2026-06-27,,,,true\n";

export const NOTE_TEMPLATE =
  "title,content,tags\n" +
  "Grocery list,Milk eggs bread,personal;todo\n" +
  "Meeting notes,Discussed Q3 plan,work\n";

/* ───────────────── CSV 导出（贴近主流 App 的导出格式，如 TickTick） ───────────────── */

// 列名与结构参考 TickTick 的 CSV 导出（开头 Date:/Version:/Status: 元数据行 + 固定表头），
// 字段细节按本应用实际数据填，未覆盖到的列留空——可被 TickTick 等工具识别导入，细微差异不影响主流工具读取。
const EXPORT_HEADERS = [
  "Folder Name", "List Name", "Title", "Tags", "Content", "Is Check list",
  "Start Date", "Due Date", "Reminder", "Repeat", "Priority", "Status",
  "Created Time", "Completed Time", "Order", "Timezone", "Is All Day",
  "Is Floating", "Column Id", "Column Name", "Order In Column", "Kind",
];

function csvField(v: string): string {
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function fmtExportDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function recurrenceToRepeatRule(ev: Pick<CalendarEvent, "recurrence" | "customIntervalDays">): string {
  switch (ev.recurrence) {
    case "daily":
      return "FREQ=DAILY;INTERVAL=1";
    case "weekly":
      return "FREQ=WEEKLY;INTERVAL=1";
    case "monthly":
      return "FREQ=MONTHLY;INTERVAL=1";
    case "custom":
      return `FREQ=DAILY;INTERVAL=${ev.customIntervalDays ?? 1}`;
    default:
      return "";
  }
}

/** 把事件 + 笔记导出为一份 CSV（结构贴近 TickTick 导出格式），方便迁移到其它主流工具。 */
export function exportToCSV(events: CalendarEvent[], notes: Note[]): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lines: string[] = [
    `Date:${fmtExportDate(new Date().toISOString())}`,
    "Version:OptiDoerApp Web 1.0",
    "Status:Enabled",
    EXPORT_HEADERS.join(","),
  ];

  for (const ev of events) {
    lines.push(
      [
        "", "", csvField(ev.title), "", csvField(ev.description),
        "N", fmtExportDate(ev.start), fmtExportDate(ev.end),
        ev.reminders.length ? String(ev.reminders[0]) : "",
        recurrenceToRepeatRule(ev), "0", ev.completed ? "1" : "0",
        fmtExportDate(ev.createdAt), ev.completed ? fmtExportDate(ev.updatedAt) : "",
        "", tz, ev.allDay ? "1" : "0", "0", "", "", "", "TEXT",
      ].join(",")
    );
  }
  for (const note of notes) {
    const content = note.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    lines.push(
      [
        "", "", csvField(note.title), csvField(note.tags.join(";")), csvField(content),
        "N", "", "", "", "", "0", note.archived ? "2" : "0",
        fmtExportDate(note.createdAt), "", "", tz, "0", "0", "", "", "", "NOTE",
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
