import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe, priceIdFor } from "@/lib/stripe";

export const runtime = "nodejs";

// 创建一个 Stripe Checkout Session（测试模式用测试 key，上线换正式 key 不用改代码）。
// 月付额外给 30 天免费试用（subscription_data.trial_period_days），对应网页上显示的
// "First Month Free"；年付价格本身已经是打折后的价格，不需要再叠加试用。

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { plan?: "tier1" | "tier2"; billing?: "monthly" | "yearly" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const plan = body.plan;
  const billing = body.billing;
  if (plan !== "tier1" && plan !== "tier2") return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  if (billing !== "monthly" && billing !== "yearly") return NextResponse.json({ error: "invalid billing" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  const userId = userData.user.id;
  const email = userData.user.email ?? undefined;

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const stripe = getStripe();

  let customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ email, metadata: { userId } });
    customerId = customer.id;
    const { error: saveErr } = await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://www.optidoerapp.com";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(plan, billing), quantity: 1 }],
    subscription_data: {
      metadata: { userId, plan, billing },
      ...(billing === "monthly" ? { trial_period_days: 30 } : {}),
    },
    metadata: { userId, plan, billing },
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/settings?checkout=cancel`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
