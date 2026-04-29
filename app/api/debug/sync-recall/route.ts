import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/debug/sync-recall
 * Dotáhne stavy botů z Recall API a spustí zpracování pro ty, co mají nahrávky
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Najdi sessions které potřebují re-sync:
  // - dispatched/pending (webhook nedorazil)
  // - done bez assembly_job_id (předčasně označené jako done)
  const { data: stuckSessions } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("user_email", session.user.email)
    .or("status.in.(dispatched,pending),and(status.eq.done,assembly_job_id.is.null)")
    .order("created_at", { ascending: false });

  if (!stuckSessions || stuckSessions.length === 0) {
    return NextResponse.json({ message: "No stuck sessions", synced: 0 });
  }

  const results = [];

  for (const botSession of stuckSessions) {
    if (!botSession.recall_bot_id) {
      results.push({ id: botSession.id, title: botSession.event_title, action: "skipped_no_bot_id" });
      continue;
    }

    try {
      // Dotáhni stav z Recall API
      const res = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${botSession.recall_bot_id}/`,
        { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } }
      );

      if (!res.ok) {
        results.push({ id: botSession.id, title: botSession.event_title, action: "recall_error", status: res.status });
        continue;
      }

      const botData = await res.json();
      const lastStatus = botData.status_changes?.[botData.status_changes.length - 1]?.code;

      if (lastStatus === "done" || lastStatus === "call_ended") {
        // Bot dokončil – stáhni recording URL
        let recordingUrl: string | null = null;

        if (botData.recordings && botData.recordings.length > 0) {
          const rec = botData.recordings[0];
          // Recall ukládá URL v media_shortcuts.video_mixed.data.download_url
          recordingUrl = rec.media_shortcuts?.video_mixed?.data?.download_url ?? null;
          // Fallback na starší formát
          if (!recordingUrl) {
            recordingUrl = rec.download_url ?? rec.url ?? botData.video_url ?? null;
          }
        }

        // Update DB
        await supabase.from("bot_sessions").update({
          status: recordingUrl ? "processing" : "done",
          recall_recording_url: recordingUrl,
          ended_at: botData.status_changes?.find((s: {code: string}) => s.code === "done")?.created_at ?? new Date().toISOString(),
        }).eq("id", botSession.id);

        // Spusť AssemblyAI pokud máme recording
        if (recordingUrl) {
          const aaiRes = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: {
              authorization: process.env.ASSEMBLYAI_API_KEY!,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              audio_url: recordingUrl,
              speaker_labels: true,
              language_code: "cs",
              webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/assembly/webhook`,
              webhook_auth_header_name: "x-meetbot-session",
              webhook_auth_header_value: botSession.id,
            }),
          });

          if (aaiRes.ok) {
            const { id: jobId } = await aaiRes.json();
            await supabase.from("bot_sessions").update({ assembly_job_id: jobId }).eq("id", botSession.id);
            results.push({ id: botSession.id, title: botSession.event_title, action: "transcription_started", jobId, recordingUrl: recordingUrl?.substring(0, 50) });
          } else {
            const errText = await aaiRes.text();
            results.push({ id: botSession.id, title: botSession.event_title, action: "assemblyai_error", error: errText.substring(0, 200) });
          }
        } else {
          results.push({ id: botSession.id, title: botSession.event_title, action: "done_no_recording" });
        }
      } else if (lastStatus === "fatal") {
        await supabase.from("bot_sessions").update({ status: "failed" }).eq("id", botSession.id);
        results.push({ id: botSession.id, title: botSession.event_title, action: "marked_failed", recallStatus: lastStatus });
      } else {
        results.push({ id: botSession.id, title: botSession.event_title, action: "still_active", recallStatus: lastStatus });
      }
    } catch (err) {
      results.push({ id: botSession.id, title: botSession.event_title, action: "error", error: String(err).substring(0, 200) });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
