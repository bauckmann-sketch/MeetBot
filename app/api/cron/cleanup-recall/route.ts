import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/cron/cleanup-recall
 * Spouštěno denně Vercel Cronem
 * Maže nahrávky z Recall.ai starší než 6 dní (free úložiště je 7 dní)
 */
export async function GET(req: NextRequest) {
  // Ověření že volá Vercel Cron (ne náhodný uživatel)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Najdi sessions starší než 6 dní, které jsou hotové a mají recall_bot_id
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldSessions } = await supabase
    .from("bot_sessions")
    .select("id, recall_bot_id, event_title, recall_cleaned")
    .in("status", ["done", "failed"])
    .not("recall_bot_id", "is", null)
    .lt("created_at", sixDaysAgo)
    .or("recall_cleaned.is.null,recall_cleaned.eq.false")
    .order("created_at", { ascending: true })
    .limit(20); // Max 20 na jedno spuštění

  if (!oldSessions || oldSessions.length === 0) {
    return NextResponse.json({ message: "Nothing to clean", cleaned: 0 });
  }

  const results = [];

  for (const session of oldSessions) {
    try {
      // Smaž bota z Recall API
      const res = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${session.recall_bot_id}/`,
        {
          method: "DELETE",
          headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
        }
      );

      if (res.ok || res.status === 404) {
        // 404 = už smazáno, to je OK
        await supabase
          .from("bot_sessions")
          .update({ recall_cleaned: true })
          .eq("id", session.id);

        results.push({
          id: session.id,
          title: session.event_title,
          action: res.status === 404 ? "already_deleted" : "deleted",
        });
      } else {
        results.push({
          id: session.id,
          title: session.event_title,
          action: "delete_failed",
          status: res.status,
        });
      }
    } catch (err) {
      results.push({
        id: session.id,
        title: session.event_title,
        action: "error",
        error: String(err).substring(0, 100),
      });
    }
  }

  console.log(`Recall cleanup: ${results.length} sessions processed`);
  return NextResponse.json({ cleaned: results.length, results });
}
