import { createClient } from "@supabase/supabase-js";

// 浏览器端用：只用 anon key，受 RLS 约束，可以安全暴露给前端。
// 没配置 Supabase 时返回 null，调用方需要自行降级（保持 localStorage-only 行为）。

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const supabaseEnabled = !!supabase;
