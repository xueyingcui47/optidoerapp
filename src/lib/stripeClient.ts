// 浏览器端只需要知道"配没配 Stripe"，用一个公开的 publishable key 当开关——
// 真正的下单/管理订阅都是调服务端 API 路由（拿不到也用不到 secret key）。
export const stripeEnabled = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

async function postJson(url: string, accessToken: string, body?: unknown): Promise<{ url: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

/** 跳到 Stripe Checkout（测试模式用测试卡号 4242 4242 4242 4242）。 */
export async function startCheckout(
  plan: "tier1" | "tier2",
  billing: "monthly" | "yearly",
  accessToken: string
): Promise<void> {
  const { url } = await postJson("/api/stripe/checkout", accessToken, { plan, billing });
  window.location.href = url;
}

/** 跳到 Stripe 的 Customer Portal——切换方案/账单周期/取消订阅都在那边做。 */
export async function openBillingPortal(accessToken: string): Promise<void> {
  const { url } = await postJson("/api/stripe/portal", accessToken);
  window.location.href = url;
}
