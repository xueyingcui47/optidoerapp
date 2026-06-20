import { createClient } from "@supabase/supabase-js";

// 仅供服务端代码使用（API Route / Route Handler）。用 service_role key，绕过 RLS。
// 绝对不要从客户端组件 import 这个文件——下面的运行时检查会直接抛错防止误用。

if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin 只能在服务端使用，不能在浏览器代码里 import。");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!url || !serviceRoleKey) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY 或 NEXT_PUBLIC_SUPABASE_URL，请检查 .env.local。");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
