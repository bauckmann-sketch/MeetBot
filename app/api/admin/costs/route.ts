import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // formát: "2025-04"

  let query = supabase
    .from("cost_logs")
    .select("*")
    .eq("user_email", session.user.email)
    .order("log_date", { ascending: true });

  if (month) {
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01`);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString().split("T")[0];
    query = query.gte("log_date", start).lt("log_date", end);
  }

  const { data: logs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Součty
  const total = logs?.reduce((sum, l) => sum + (l.amount_usd ?? 0), 0) ?? 0;
  const byType = {
    bot: logs?.filter((l) => l.type === "bot").reduce((s, l) => s + l.amount_usd, 0) ?? 0,
    transcription: logs?.filter((l) => l.type === "transcription").reduce((s, l) => s + l.amount_usd, 0) ?? 0,
    storage: logs?.filter((l) => l.type === "storage").reduce((s, l) => s + l.amount_usd, 0) ?? 0,
  };

  return NextResponse.json({ logs, total, byType });
}
