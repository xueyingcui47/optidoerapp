import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe, planFromPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

// Stripe 真实订阅状态的唯一权威来源。需要在 Stripe 控制台（测试模式）建一个 webhook，
// 指向 https://<域名>/api/stripe/webhook，订阅这 3 个事件，并把生成的签名密钥填进
// STRIPE_WEBHOOK_SECRET。签名校验必须用没被 JSON.parse 过的原始请求体，所以这里用
// req.text() 而不是 req.json()。

async function findProfileIdByCustomer(admin: ReturnType<typeof getSupabaseAdmin>, customerId: string) {
  const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id as string | undefined;
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as "tier1" | "tier2" | undefined;
      const billing = session.metadata?.billing as "monthly" | "yearly" | undefined;
      if (userId && plan && billing && session.customer && session.subscription) {
        const { error } = await admin
          .from("profiles")
          .update({
            subscribed: true,
            plan,
            billing,
            subscribed_at: new Date().toISOString(),
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            pending_billing: null,
            pending_billing_effective_at: null,
          })
          .eq("id", userId);
        if (error) console.error("[stripe webhook] checkout.session.completed update failed:", error);
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const userId = sub.metadata?.userId || (await findProfileIdByCustomer(admin, customerId));
      if (userId) {
        const priceId = sub.items.data[0]?.price.id;
        const mapped = priceId ? planFromPriceId(priceId) : null;
        const active = sub.status === "active" || sub.status === "trialing";
        const { error } = await admin
          .from("profiles")
          .update({
            subscribed: active,
            ...(mapped ? { plan: mapped.plan, billing: mapped.billing } : {}),
            stripe_subscription_id: sub.id,
          })
          .eq("id", userId);
        if (error) console.error("[stripe webhook] customer.subscription.updated update failed:", error);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const userId = sub.metadata?.userId || (await findProfileIdByCustomer(admin, customerId));
      if (userId) {
        const { error } = await admin
          .from("profiles")
          .update({
            subscribed: false,
            plan: null,
            billing: null,
            stripe_subscription_id: null,
            pending_billing: null,
            pending_billing_effective_at: null,
          })
          .eq("id", userId);
        if (error) console.error("[stripe webhook] customer.subscription.deleted update failed:", error);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
