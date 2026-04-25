import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

/**
 * Debug endpoint – kontrola stavu botů na Recall.ai
 * GET /api/debug/recall-status
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Načti posledních 5 sessions
  const { data: sessions } = await supabase
    .from("bot_sessions")
    .select("id, event_title, recall_bot_id, status, created_at")
    .eq("user_email", session.user.email)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ message: "No sessions found" });
  }

  // Pro každou session zkontroluj stav na Recall
  const results = [];
  for (const s of sessions) {
    if (!s.recall_bot_id) {
      results.push({ ...s, recall_status: "no_bot_id" });
      continue;
    }

    try {
      const res = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${s.recall_bot_id}/`,
        { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } }
      );

      if (!res.ok) {
        results.push({ ...s, recall_status: `error_${res.status}`, recall_error: await res.text() });
        continue;
      }

      const botData = await res.json();
      results.push({
        ...s,
        recall_status: botData.status_changes?.[botData.status_changes.length - 1]?.code ?? "unknown",
        recall_video_url: botData.video_url ?? null,
        recall_recordings: botData.recordings?.length ?? 0,
        recall_meeting_url: botData.meeting_url ?? null,
      });
    } catch (err) {
      results.push({ ...s, recall_status: "fetch_error", recall_error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
