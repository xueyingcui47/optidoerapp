import type { ParsedEventDraft } from "./types";

export interface ParseResult {
  draft: ParsedEventDraft;
  engine: "claude" | "mock";
  fallback?: boolean;
}

/** 调用服务端 /api/ai/parse-event，把自然语言转成事件草稿。 */
export async function parseEvent(text: string): Promise<ParseResult> {
  const res = await fetch("/api/ai/parse-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, now: new Date().toISOString() }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Parsing failed (${res.status}) ${msg}`);
  }
  return (await res.json()) as ParseResult;
}
