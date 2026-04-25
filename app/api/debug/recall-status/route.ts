import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

/**
 * Debug endpoint – kontrola stavu botů na Recall.ai
 * GET /api/debug/recall-status
 */
export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email;

  const supabase = createServerClient();

  // Debug info
  const debugInfo: Record<string, unknown> = {
    authenticated: !!session,
    userEmail: userEmail ?? "none",
    hasAccessToken: !!session?.accessToken,
  };

  // Načti posledních 5 sessions (bez email filtru pro debug)
  const { data: sessions, error: queryError } = await supabase
    .from("bot_sessions")
    .select("id, event_title, recall_bot_id, status, user_email, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (queryError) {
    return NextResponse.json({ debugInfo, error: queryError.message });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ debugInfo, message: "No sessions in DB at all" });
  }

  // Pro každou session zkontroluj stav na Recall
  const results = [];
  for (const s of sessions) {
    const result: Record<string, unknown> = { ...s };

    if (!s.recall_bot_id) {
      result.recall_status = "no_bot_id";
      results.push(result);
      continue;
    }

    try {
      const res = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${s.recall_bot_id}/`,
        { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } }
      );

      if (!res.ok) {
        result.recall_status = `error_${res.status}`;
        result.recall_error = (await res.text()).substring(0, 200);
        results.push(result);
        continue;
      }

      const botData = await res.json();
      const lastStatus = botData.status_changes?.[botData.status_changes.length - 1];
      result.recall_current_status = lastStatus?.code ?? "unknown";
      result.recall_video_url = botData.video_url ?? null;
      result.recall_recordings_count = botData.recordings?.length ?? 0;
      result.recall_status_changes = botData.status_changes?.map(
        (sc: { code: string; created_at: string }) => `${sc.code} @ ${sc.created_at}`
      ) ?? [];
      results.push(result);
    } catch (err) {
      result.recall_status = "fetch_error";
      result.recall_error = String(err).substring(0, 200);
      results.push(result);
    }
  }

  return NextResponse.json({ debugInfo, results });
}
