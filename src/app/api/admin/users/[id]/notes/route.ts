import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// 管理员后台：查看某个用户的笔记（敏感操作，仅白名单管理员可调用）。

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(req);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("notes")
    .select("*")
    .eq("user_id", params.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data });
}
