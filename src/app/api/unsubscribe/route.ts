import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyUnsub } from "@/lib/unsubscribe";

export const runtime = "nodejs";

// 一键退订：邮件里的退订链接点进来，把这个用户的 settings.channels.email 关掉。
// 链接带 HMAC 签名，校验通过才操作，防止别人伪造 uid 退订别人。
// 用 GET 是为了邮件里能直接点（不需要表单），CAN-SPAM 要求提供这种简单退订方式。

function page(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
     <title>OptiDoerApp</title></head>
     <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:48px auto;padding:24px;color:#1e293b;text-align:center;">
       <div style="font-size:20px;font-weight:700;color:#4f46e5;margin-bottom:12px;">OptiDoerApp</div>
       <p style="font-size:15px;line-height:1.6;">${message}</p>
       <p style="margin-top:24px;"><a href="https://www.optidoerapp.com/settings" style="color:#4f46e5;">Manage notification settings</a></p>
     </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!verifyUnsub(uid, token)) {
    return page("This unsubscribe link is invalid or has expired.");
  }

  const admin = getSupabaseAdmin();
  const { data: profile, error: readErr } = await admin
    .from("profiles")
    .select("settings")
    .eq("id", uid)
    .maybeSingle();
  if (readErr) return page("Something went wrong. Please try again later.");

  const settings = { ...(profile?.settings ?? {}) } as Record<string, any>;
  settings.channels = { ...(settings.channels ?? {}), email: false };

  const { error: updateErr } = await admin.from("profiles").update({ settings }).eq("id", uid);
  if (updateErr) return page("Something went wrong. Please try again later.");

  return page("You've been unsubscribed from daily digest emails. You can turn them back on anytime in Settings.");
}
