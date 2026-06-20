import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fromDbEvent } from "@/lib/db";
import { expandEventsInRange } from "@/lib/recurrence";
import { fmtTime } from "@/lib/date";

export const runtime = "nodejs";

// 每天定时发"今日日程"邮件。由 Vercel Cron 按 vercel.json 里的 schedule 调用，
// Vercel 会自动在请求头里带上 Authorization: Bearer <CRON_SECRET>，下面做校验防止被外部乱调用。
//
// 已知限制（MVP，先用着，之后想做更准的再改）：
// "今天"按 UTC 自然日算，不是按每个用户自己的时区——比如 UTC 13:00 跑的话，对美西用户来说
// 還是前一天凌晨 5-6 点，邮件里的"今天"会有点错位。要做对，需要给每个用户存时区、按时区分批发，
// 这个量先不做，等用户规模上来了再优化。

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const admin = getSupabaseAdmin();

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

  const [{ data: profiles, error: profilesErr }, { data: events, error: eventsErr }] = await Promise.all([
    admin.from("profiles").select("id, email, name"),
    admin.from("events").select("*"),
  ]);
  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });

  const eventsByUser = new Map<string, ReturnType<typeof fromDbEvent>[]>();
  for (const row of events ?? []) {
    const list = eventsByUser.get(row.user_id) ?? [];
    list.push(fromDbEvent(row));
    eventsByUser.set(row.user_id, list);
  }

  let sent = 0;
  const results: { email: string; eventCount: number; ok: boolean }[] = [];

  for (const profile of profiles ?? []) {
    if (!profile.email) continue;
    const userEvents = eventsByUser.get(profile.id) ?? [];
    const todays = expandEventsInRange(userEvents, todayStart, todayEnd).sort(
      (a, b) => +new Date(a.start) - +new Date(b.start)
    );
    if (todays.length === 0) continue;

    const itemsHtml = todays
      .map((ev) => {
        const time = ev.allDay ? "All day" : fmtTime(new Date(ev.start));
        return `<li><strong>${time}</strong> — ${escapeHtml(ev.title || "(untitled)")}</li>`;
      })
      .join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="font-size: 20px; font-weight: 700; color: #4f46e5;">OptiDoerApp</div>
        <h1 style="font-size: 18px; margin: 16px 0 12px;">Today's schedule</h1>
        <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px;">${itemsHtml}</ul>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
          You're receiving this because you have events scheduled today in OptiDoerApp.
        </p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "OptiDoerApp <todaytask@optidoerapp.com>",
        to: profile.email,
        subject: "Your Daily Digest",
        html,
      }),
    });

    if (res.ok) sent++;
    results.push({ email: profile.email, eventCount: todays.length, ok: res.ok });
  }

  return NextResponse.json({ sent, total: results.length, results });
}
