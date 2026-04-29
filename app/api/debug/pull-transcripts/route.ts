import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/debug/pull-transcripts
 * Ručně stáhne dokončené přepisy z AssemblyAI pro sessions ve stavu "processing"
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: processingSessions } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("user_email", session.user.email)
    .eq("status", "processing")
    .not("assembly_job_id", "is", null)
    .order("created_at", { ascending: false });

  if (!processingSessions || processingSessions.length === 0) {
    return NextResponse.json({ message: "No processing sessions", pulled: 0 });
  }

  const results = [];

  for (const botSession of processingSessions) {
    try {
      // Stáhni stav z AssemblyAI
      const res = await fetch(
        `https://api.assemblyai.com/v2/transcript/${botSession.assembly_job_id}`,
        { headers: { authorization: process.env.ASSEMBLYAI_API_KEY! } }
      );

      if (!res.ok) {
        results.push({ id: botSession.id, title: botSession.event_title, action: "aai_error", status: res.status });
        continue;
      }

      const transcript = await res.json();

      if (transcript.status !== "completed") {
        results.push({ id: botSession.id, title: botSession.event_title, action: "still_processing", aaiStatus: transcript.status });
        continue;
      }

      // Přepis je hotový – ulož do DB
      const utterances = transcript.utterances ?? [];
      const txtContent = buildTranscriptText(transcript, botSession.event_title);

      // Ulož utterances
      if (utterances.length > 0 || transcript.text) {
        await supabase.from("transcript_data").upsert({
          session_id: botSession.id,
          utterances: utterances,
          text: transcript.text ?? "",
          updated_at: new Date().toISOString(),
        });
      }

      // Vypočítej náklady
      const durationHours = (botSession.duration_secs ?? 0) / 3600;
      const costBot = parseFloat((durationHours * 0.5).toFixed(4));
      const costTranscript = parseFloat((durationHours * 0.37).toFixed(4));

      // Update session
      await supabase.from("bot_sessions").update({
        status: "done",
        cost_bot_usd: costBot,
        cost_transcript_usd: costTranscript,
      }).eq("id", botSession.id);

      results.push({
        id: botSession.id,
        title: botSession.event_title,
        action: "completed",
        utterances: utterances.length,
        textLength: (transcript.text ?? "").length,
      });
    } catch (err) {
      results.push({ id: botSession.id, title: botSession.event_title, action: "error", error: String(err).substring(0, 200) });
    }
  }

  return NextResponse.json({ pulled: results.length, results });
}

function buildTranscriptText(transcript: { id: string; text?: string; utterances?: Array<{ speaker: string; text: string; start: number }> }, eventTitle: string): string {
  const lines: string[] = [
    `📝 Přepis: ${eventTitle}`,
    `Datum: ${new Date().toLocaleDateString("cs-CZ")}`,
    `ID: ${transcript.id}`,
    "═══════════════════════════════════════",
    "",
  ];

  if (transcript.utterances && transcript.utterances.length > 0) {
    let currentSpeaker = "";
    for (const utt of transcript.utterances) {
      const time = formatMs(utt.start);
      if (utt.speaker !== currentSpeaker) {
        currentSpeaker = utt.speaker;
        lines.push("");
        lines.push(`── Mluvčí ${utt.speaker} ──`);
      }
      lines.push(`  [${time}] ${utt.text}`);
    }
  } else {
    lines.push(transcript.text ?? "(prázdný přepis)");
  }

  return lines.join("\n");
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
