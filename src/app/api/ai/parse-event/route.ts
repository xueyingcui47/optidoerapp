import { NextRequest, NextResponse } from "next/server";
import { mockParseEvent } from "@/lib/mockParser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ParsedEventDraft } from "@/lib/types";

export const runtime = "nodejs";

// 自然语言 → 事件草稿。
// 设了 ANTHROPIC_API_KEY 就调用 Claude；否则用本地 mock 解析器。
// 这样「先 mock，之后填 key」无需改动任何前端代码。
//
// 安全：这个接口会调用 Claude（花钱），所以配置了 Supabase 时必须是已登录用户才能调用，
// 否则匿名请求能直接烧光 API 额度。再加一个每用户的简单限流。

// 是否启用鉴权：只有配齐了 Supabase 服务端环境变量时才强制（纯本地/demo 模式不挡）。
const AUTH_ENABLED = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// 每用户限流：滑动窗口，每分钟最多 N 次。注意 Vercel 是无状态多实例，这个内存计数只在
// 单个实例内有效、冷启动会清零——属于"够用的第一层防滥用"，不是严格的全局限流。
// 要严格全局限流需要外部存储（Upstash Redis / Supabase 表），规模上来了再加。
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > RATE_LIMIT;
}

const SYSTEM_PROMPT = `You are a calendar event parsing assistant for a notes & calendar app.
The user gives a natural-language description of a calendar event (English or Chinese).
Extract a single event. Resolve relative dates/times ("tomorrow", "明天下午3点", "next monday")
against the provided current datetime and timezone. If no time is given, treat it as an all-day event.
If no end time is given, assume a 1-hour duration. Choose the most reasonable interpretation.

If the description implies the event repeats, set "recurrence" to one of "daily", "weekdays"
(every Monday–Friday, skipping weekends), "weekly", "monthly", or "custom" (custom = repeat every
N days, set "customIntervalDays" to N). If a specific number of repetitions is stated or implied
(e.g. "10 consecutive workdays", "for 3 weeks", "every Monday for a month"), set
"recurrenceOccurrences" to that count — for a "weekdays" recurrence the count is in weekdays, not
calendar days (e.g. "10 consecutive workdays" = recurrence "weekdays", recurrenceOccurrences 10).
If no specific count is stated, leave "recurrenceOccurrences" null (repeats forever).
If the event does not repeat, set "recurrence" to "none" and leave "customIntervalDays" and
"recurrenceOccurrences" null.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    start: { type: ["string", "null"], description: "ISO 8601 datetime" },
    end: { type: ["string", "null"], description: "ISO 8601 datetime" },
    location: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    allDay: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string" },
    recurrence: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly", "custom"] },
    customIntervalDays: { type: ["integer", "null"], description: "only set when recurrence is custom" },
    recurrenceOccurrences: { type: ["integer", "null"], description: "number of repeats; null = endless" },
  },
  required: [
    "title",
    "start",
    "end",
    "location",
    "description",
    "allDay",
    "confidence",
    "recurrence",
    "customIntervalDays",
    "recurrenceOccurrences",
  ],
} as const;

async function parseWithClaude(text: string, nowISO: string, tz: string): Promise<ParsedEventDraft> {
  // 动态导入：未安装 SDK / 未配置 key 的环境照样能跑 mock。
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Current datetime: ${nowISO} (timezone: ${tz})\n\nEvent description:\n"""${text}"""`,
      },
    ],
  } as any);

  const block = (response.content as any[]).find((b) => b.type === "text");
  const raw = block?.text ?? "{}";
  const parsed = JSON.parse(raw) as ParsedEventDraft;
  return parsed;
}

export async function POST(req: NextRequest) {
  // 鉴权（配置了 Supabase 时强制）：必须带有效的登录 token。
  if (AUTH_ENABLED) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Sign in to use AI parsing." }, { status: 401 });
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    if (rateLimited(data.user.id)) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
  }

  let body: { text?: string; now?: string; tz?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const nowISO = body.now || new Date().toISOString();
  // 必须用客户端浏览器自己上报的时区——服务端跑在 Vercel 上默认是 UTC，
  // 不能用 Intl.DateTimeFormat().resolvedOptions().timeZone 去猜，那只会拿到服务器的时区。
  const tz = body.tz || "UTC";

  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasKey) {
    try {
      const draft = await parseWithClaude(text, nowISO, tz);
      return NextResponse.json({ draft, engine: "claude" });
    } catch (err) {
      // Claude 失败时优雅降级到 mock，绝不中断用户流程（对应 AI 指南 3.1「错误处理与降级」）。
      console.error("[parse-event] Claude failed, falling back to mock:", err);
      const draft = mockParseEvent(text, nowISO, tz);
      return NextResponse.json({ draft, engine: "mock", fallback: true });
    }
  }

  const draft = mockParseEvent(text, nowISO, tz);
  return NextResponse.json({ draft, engine: "mock" });
}
