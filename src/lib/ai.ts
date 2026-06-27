import type { ParsedEventDraft } from "./types";
import { supabase } from "./supabaseClient";

export interface ParseResult {
  draft: ParsedEventDraft;
  engine: "claude" | "mock";
  fallback?: boolean;
}

/** 调用服务端 /api/ai/parse-event，把自然语言转成事件草稿。 */
export async function parseEvent(text: string): Promise<ParseResult> {
  // 带上登录态，服务端用它校验"是不是已登录用户"——防止匿名请求烧 Claude 额度。
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch("/api/ai/parse-event", {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      now: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Parsing failed (${res.status}) ${msg}`);
  }
  return (await res.json()) as ParseResult;
}
