import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Recall.ai Webhook – přijímá stav bota
 * Payload formát:
 * {
 *   "event": "bot.status_change",
 *   "data": {
 *     "data": { "code": "in_call_recording", "sub_code": null, "updated_at": "..." },
 *     "bot": { "id": "...", "metadata": { "session_id": "..." } }
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.text();

  // Kvůli debugování logujeme payload
  console.log("Recall webhook received:", body.substring(0, 500));

  let payload: RecallWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { event, data } = payload;

  // Extrahuj bot ID a status z nového formátu
  const botId = data.bot?.id ?? data.bot_id;
  const statusCode = data.data?.code ?? data.status;
  const metadata = data.bot?.metadata ?? {};

  if (!botId) {
    console.error("Recall webhook: missing bot ID", payload);
    return NextResponse.json({ ok: true });
  }

  console.log(`Recall webhook: event=${event}, botId=${botId}, status=${statusCode}`);

  // Najdi bot session
  const { data: botSession } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("recall_bot_id", botId)
    .single();

  if (!botSession) {
    // Zkus najít přes metadata session_id
    if (metadata.session_id) {
      const { data: sessionByMeta } = await supabase
        .from("bot_sessions")
        .select("*")
        .eq("id", metadata.session_id)
        .single();
      if (!sessionByMeta) {
        console.log("Recall webhook: unknown bot, ignoring", botId);
        return NextResponse.json({ ok: true });
      }
      // Aktualizuj recall_bot_id
      await supabase.from("bot_sessions").update({ recall_bot_id: botId }).eq("id", sessionByMeta.id);
      return handleStatusChange(sessionByMeta, statusCode, supabase);
    }
    console.log("Recall webhook: unknown bot, ignoring", botId);
    return NextResponse.json({ ok: true });
  }

  if (event === "bot.status_change") {
    return handleStatusChange(botSession, statusCode, supabase);
  }

  return NextResponse.json({ ok: true });
}

async function handleStatusChange(
  botSession: BotSessionRow,
  statusCode: string | undefined,
  supabase: ReturnType<typeof createServerClient>
) {
  const status = statusCode?.toLowerCase();
  console.log(`Processing status change for session ${botSession.id}: ${status}`);

  if (status === "in_call_recording" || status === "joining_call" || status === "in_waiting_room" || status === "in_call_not_recording") {
    await supabase
      .from("bot_sessions")
      .update({ status: "joined" })
      .eq("id", botSession.id);
  }

  if (status === "done" || status === "call_ended") {
    // Stáhni recording URL z Recall API
    let recordingUrl: string | null = null;
    let durationSecs: number | null = null;

    try {
      const botDetailRes = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botSession.recall_bot_id}/`, {
        headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
      });

      if (botDetailRes.ok) {
        const botDetail = await botDetailRes.json();
        // Recall API vrací URL v recordings[0].media_shortcuts.video_mixed.data.download_url
        if (botDetail.recordings && botDetail.recordings.length > 0) {
          const rec = botDetail.recordings[0];
          recordingUrl = rec.media_shortcuts?.video_mixed?.data?.download_url ?? null;
          if (!recordingUrl) {
            recordingUrl = rec.download_url ?? rec.url ?? botDetail.video_url ?? null;
          }
        }
        // Délka
        if (botDetail.meeting_metadata?.duration) {
          durationSecs = botDetail.meeting_metadata.duration;
        }
        console.log(`Bot detail: recording=${recordingUrl ? "yes" : "no"}, duration=${durationSecs}`);
      } else {
        console.error("Failed to fetch bot detail:", botDetailRes.status, await botDetailRes.text());
      }
    } catch (err) {
      console.error("Error fetching bot detail:", err);
    }

    await supabase.from("bot_sessions").update({
      status: "processing",
      recall_recording_url: recordingUrl,
      duration_secs: durationSecs,
      ended_at: new Date().toISOString(),
    }).eq("id", botSession.id);

    // Spusť AssemblyAI async
    if (recordingUrl) {
      await triggerAssemblyAI(botSession.id, botSession.user_email, recordingUrl, supabase);
    } else {
      console.warn("No recording URL available for session:", botSession.id);
      // Označíme jako done bez přepisu
      await supabase.from("bot_sessions").update({ status: "done" }).eq("id", botSession.id);
    }
  }

  if (status === "fatal" || status === "error") {
    await supabase
      .from("bot_sessions")
      .update({ status: "failed" })
      .eq("id", botSession.id);
  }

  return NextResponse.json({ ok: true });
}

async function triggerAssemblyAI(
  sessionId: string,
  _userEmail: string,
  audioUrl: string,
  supabase: ReturnType<typeof createServerClient>
) {
  try {
    const res = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        language_code: "cs",
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/assembly/webhook`,
        webhook_auth_header_name: "x-meetbot-session",
        webhook_auth_header_value: sessionId,
      }),
    });

    if (!res.ok) {
      console.error("AssemblyAI error:", await res.text());
      return;
    }

    const { id: assemblyJobId } = await res.json();

    await supabase
      .from("bot_sessions")
      .update({ assembly_job_id: assemblyJobId })
      .eq("id", sessionId);
    
    console.log(`AssemblyAI job started: ${assemblyJobId} for session ${sessionId}`);
  } catch (err) {
    console.error("triggerAssemblyAI error:", err);
  }
}

interface BotSessionRow {
  id: string;
  user_email: string;
  recall_bot_id: string | null;
  [key: string]: unknown;
}

interface RecallWebhookPayload {
  event: string;
  data: {
    // Nový formát Recall
    bot?: {
      id: string;
      metadata?: Record<string, string>;
    };
    data?: {
      code?: string;
      sub_code?: string | null;
      updated_at?: string;
    };
    // Starý formát (pro kompatibilitu)
    bot_id?: string;
    status?: string;
    recording?: {
      video_url?: string;
      duration_secs?: number;
    };
  };
}
