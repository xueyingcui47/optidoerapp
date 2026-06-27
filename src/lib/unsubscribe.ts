import crypto from "crypto";

// 退订链接里的防伪签名：HMAC(userId)。这样邮件里的退订链接别人猜不出、改不了 uid 去退订
// 别人的订阅。复用 CRON_SECRET 当密钥（也可单独配 UNSUBSCRIBE_SECRET）。

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("缺少 UNSUBSCRIBE_SECRET / CRON_SECRET，无法生成退订链接签名。");
  return s;
}

export function signUnsub(userId: string): string {
  return crypto.createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUnsub(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = signUnsub(userId);
  // 定长比较，避免时序侧信道。
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(origin: string, userId: string): string {
  return `${origin}/api/unsubscribe?uid=${encodeURIComponent(userId)}&token=${signUnsub(userId)}`;
}
