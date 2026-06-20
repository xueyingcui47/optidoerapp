import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// 管理员后台：列出所有用户的 profile（姓名/邮箱/试用/订阅信息）。

export async function GET(req: NextRequest) {
  const check = await requireAdmin(req);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}
