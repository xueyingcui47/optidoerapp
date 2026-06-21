import Stripe from "stripe";

// 仅供服务端使用（API Route）。secret key 绝不能进到浏览器代码里。
if (typeof window !== "undefined") {
  throw new Error("stripe.ts 只能在服务端使用，不能在浏览器代码里 import。");
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("缺少 STRIPE_SECRET_KEY，请检查 .env.local / Vercel 环境变量。");
  }
  return new Stripe(key);
}

// plan + billing → Stripe 价格 ID。这 4 个价格要先在 Stripe 控制台（测试模式）建好，
// 把生成的 price_xxx 填进对应的环境变量。
export function priceIdFor(plan: "tier1" | "tier2", billing: "monthly" | "yearly"): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`;
  const id = process.env[key];
  if (!id) throw new Error(`缺少环境变量 ${key}，请在 Stripe 控制台建好对应价格后填入 .env.local。`);
  return id;
}

// 反过来：webhook 收到 Stripe 价格 ID（比如用户在 Customer Portal 自己切了方案），
// 查出这是我们这边的哪个 plan/billing 组合，好同步回 profiles 表。
export function planFromPriceId(priceId: string): { plan: "tier1" | "tier2"; billing: "monthly" | "yearly" } | null {
  const plans: Array<"tier1" | "tier2"> = ["tier1", "tier2"];
  const billings: Array<"monthly" | "yearly"> = ["monthly", "yearly"];
  for (const plan of plans) {
    for (const billing of billings) {
      const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`;
      if (process.env[key] === priceId) return { plan, billing };
    }
  }
  return null;
}
