import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createHmac } from "crypto";

/**
 * Recall.ai Webhook – přijímá stav bota
 * Spouští AssemblyAI job async, žádné velké stahování
 */
export async function POST(req: NextRequest) {
  const body = await req.text();

  // Ověření HMAC podpisu od Recall.ai
  const signature = req.headers.get("x-recall-signature");
  if (process.env.RECALL_WEBHOOK_SECRET && signature) {
    const expected = createHmac("sha256", process.env.RECALL_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");
    if (expected !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: RecallWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { event, data } = payload;

  // Najdi bot session
  const { data: botSession } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("recall_bot_id", data.bot_id)
    .single();

  if (!botSession) {
    // Neznámý bot – ignoruj
    return NextResponse.json({ ok: true });
  }

  if (event === "bot.status_change") {
    const status = data.status?.toLowerCase();

    if (status === "in_call_recording" || status === "joining_call") {
      await supabase
        .from("bot_sessions")
        .update({ status: "joined" })
        .eq("id", botSession.id);
    }

    if (status === "done" || status === "call_ended") {
      const recordingUrl = data.recording?.video_url;
      const durationSecs = data.recording?.duration_secs ?? null;

      await supabase.from("bot_sessions").update({
        status: "processing",
        recall_recording_url: recordingUrl ?? null,
        duration_secs: durationSecs,
        ended_at: new Date().toISOString(),
      }).eq("id", botSession.id);

      // Spusť AssemblyAI async (NEČEKÁ – jen pošle job)
      if (recordingUrl) {
        await triggerAssemblyAI(botSession.id, botSession.user_email, recordingUrl, supabase);
      }
    }

    if (status === "fatal" || status === "error") {
      await supabase
        .from("bot_sessions")
        .update({ status: "failed" })
        .eq("id", botSession.id);
    }
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

interface RecallWebhookPayload {
  event: string;
  data: {
    bot_id: string;
    status?: string;
    recording?: {
      video_url?: string;
      duration_secs?: number;
    };
  };
}
