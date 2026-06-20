// 仅服务端使用：校验请求者是否是管理员。
// 规则：请求头带 Authorization: Bearer <用户的 Supabase access token>，
// 用 service_role key 验证这个 token 真实有效，再核对邮箱是否在 ADMIN_EMAILS 白名单里。

import { getSupabaseAdmin } from "./supabaseAdmin";

export interface AdminCheckResult {
  ok: boolean;
  email?: string;
  status: number;
  message?: string;
}

export async function requireAdmin(request: Request): Promise<AdminCheckResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Missing credentials." };

  const allowList = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowList.length === 0) {
    return { ok: false, status: 403, message: "ADMIN_EMAILS is not configured — nobody can access the admin backend." };
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) return { ok: false, status: 401, message: "Invalid credentials." };

  const email = data.user.email.toLowerCase();
  if (!allowList.includes(email)) {
    return { ok: false, status: 403, message: "This account is not in the admin allowlist." };
  }
  return { ok: true, status: 200, email };
}
