import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fromDbEvent } from "@/lib/db";
import { expandEventsInRange } from "@/lib/recurrence";
import { unsubscribeUrl } from "@/lib/unsubscribe";

export const runtime = "nodejs";

// 每天定时发"今日日程"邮件。由 Vercel Cron 按 vercel.json 里的 schedule 调用，
// Vercel 会自动在请求头里带上 Authorization: Bearer <CRON_SECRET>，下面做校验防止被外部乱调用。
//
// 已知限制（MVP，先用着，之后想做更准的再改）：
// ① "今天"按 UTC 自然日算，不是按每个用户自己的时区——比如 UTC 13:00 跑的话，对美西用户来说
// 還是前一天凌晨 5-6 点，邮件里的"今天"会有点错位。
// ② 邮件里显示的时间用的是 DIGEST_TIMEZONE 这个固定时区（默认美西），不是每个用户各自的时区——
// 服务端跑在 Vercel 上默认是 UTC，不能像浏览器那样用 toLocaleTimeString() 自动取当地时区。
// 要做对都需要给每个用户存时区、按时区分批发，这个量先不做，等用户规模上来了再优化。
const DIGEST_TIMEZONE = process.env.DIGEST_TIMEZONE || "America/Los_Angeles";

function fmtTimeInZone(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DIGEST_TIMEZONE,
  });
}

function fmtDateInZone(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DIGEST_TIMEZONE,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CLOSING_LINES = [
  "Take it one item at a time — you've got this. Wishing you a productive and joyful day ahead! 🌟",
  "Pace yourself, celebrate the small wins, and don't forget to breathe between tasks. Have a wonderful day! ☀️",
  "Here's to checking things off the list and still leaving room for something good. Make today count! 💪",
];

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
    admin.from("profiles").select("id, email, name, settings"),
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

  // 退订链接需要站点地址；优先用 cron 请求自带的 origin，否则用配置的站点地址。
  const origin =
    req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://www.optidoerapp.com";

  for (const profile of profiles ?? []) {
    if (!profile.email) continue;
    // 尊重用户在 Settings 里关掉的"邮件提醒"。settings 存在 profiles 表里（jsonb）。
    // 没设置过 settings 的老用户默认视为开启（保持原行为）。
    const emailPref = (profile.settings as any)?.channels?.email;
    if (emailPref === false) continue;
    const userEvents = eventsByUser.get(profile.id) ?? [];
    const todays = expandEventsInRange(userEvents, todayStart, todayEnd).sort(
      (a, b) => +new Date(a.start) - +new Date(b.start)
    );
    if (todays.length === 0) continue;

    const itemsHtml = todays
      .map((ev) => {
        const time = ev.allDay ? "All day" : fmtTimeInZone(new Date(ev.start));
        return `<li style="margin-bottom: 6px;"><strong>${time}</strong> — ${escapeHtml(ev.title || "(untitled)")}</li>`;
      })
      .join("");

    const firstName = (profile.name || "").trim().split(" ")[0] || "there";
    const dateLabel = fmtDateInZone(now);
    const count = todays.length;
    const sizeBlurb =
      count <= 2
        ? "Looks like a lighter day — a good chance to get ahead on something else, too."
        : count <= 5
        ? "A solid lineup today — nothing you can't handle."
        : "It's a full day — worth blocking out time for the big items first.";
    const closing = CLOSING_LINES[Math.floor(Math.random() * CLOSING_LINES.length)];

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <div style="font-size: 20px; font-weight: 700; color: #4f46e5;">OptiDoerApp</div>
        <p style="font-size: 14px; color: #64748b; margin-top: 4px;">${dateLabel}</p>

        <h1 style="font-size: 19px; margin: 20px 0 4px;">Good morning, ${escapeHtml(firstName)} 👋</h1>
        <p style="font-size: 15px; line-height: 1.6;">
          You've got <strong>${count} thing${count === 1 ? "" : "s"}</strong> on the books today. ${sizeBlurb}
          Here's the rundown:
        </p>

        <ul style="font-size: 15px; line-height: 1.6; padding-left: 20px; margin: 16px 0;">${itemsHtml}</ul>

        <p style="font-size: 15px; line-height: 1.6; margin-top: 20px;">${closing}</p>

        <p style="font-size: 15px; margin-top: 20px;">— The OptiDoerApp Team</p>

        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          You're receiving this because you have events scheduled today in OptiDoerApp. Open the app anytime to add, edit, or reschedule.
          <br />
          <a href="${unsubscribeUrl(origin, profile.id)}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe from daily digests</a>
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
