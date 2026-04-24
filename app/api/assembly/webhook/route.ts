import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { google } from "googleapis";

/**
 * AssemblyAI Webhook – přepis dokončen
 * Stáhne výsledek, nahraje na Drive, aktualizuje DB
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript_id, status } = body;

  if (status !== "completed") {
    // error nebo jiný stav
    return NextResponse.json({ ok: true });
  }

  // Session ID posíláme v custom header
  const sessionId = req.headers.get("x-meetbot-session");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session header" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Najdi session
  const { data: botSession } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!botSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    // Stáhni přepis z AssemblyAI
    const transcriptRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcript_id}`,
      {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY! },
      }
    );

    if (!transcriptRes.ok) {
      throw new Error(`AssemblyAI fetch error: ${await transcriptRes.text()}`);
    }

    const transcript = await transcriptRes.json();

    // Vytvoř TXT přepis s časovými značkami a mluvčími
    const txtContent = buildTranscriptText(transcript);

    // Ulož přepis JSON do DB (pro zobrazení v UI)
    const utterances = transcript.utterances ?? [];

    // Nahrát na Google Drive uživatele
    let driveTranscriptUrl: string | null = null;
    try {
      driveTranscriptUrl = await uploadToDrive(
        botSession.user_email,
        botSession.event_title,
        txtContent,
        supabase
      );
    } catch (driveErr) {
      console.error("Drive upload error:", driveErr);
      // Nepřeruš – přepis aspoň uložíme do DB
    }

    // Vypočítej náklady
    const durationHours = (botSession.duration_secs ?? 0) / 3600;
    const costBot = parseFloat((durationHours * 0.5).toFixed(4));
    const costTranscript = parseFloat((durationHours * 0.37).toFixed(4));

    // Ulož náklady
    await supabase.from("cost_logs").insert([
      {
        session_id: botSession.id,
        user_email: botSession.user_email,
        log_date: new Date().toISOString().split("T")[0],
        type: "bot",
        amount_usd: costBot,
        note: `Bot ${Math.round(durationHours * 60)} min`,
      },
      {
        session_id: botSession.id,
        user_email: botSession.user_email,
        log_date: new Date().toISOString().split("T")[0],
        type: "transcription",
        amount_usd: costTranscript,
        note: `AssemblyAI ${Math.round(durationHours * 60)} min`,
      },
    ]);

    // Update session
    await supabase.from("bot_sessions").update({
      status: "done",
      drive_transcript_url: driveTranscriptUrl,
      cost_bot_usd: costBot,
      cost_transcript_usd: costTranscript,
      // Ulož utterances jako JSONB do extra sloupce
      // (přidáme v schema)
    }).eq("id", sessionId);

    // Ulož utterances zvlášť do transcript_data tabulky
    if (utterances.length > 0) {
      await supabase.from("transcript_data").upsert({
        session_id: sessionId,
        utterances: utterances,
        text: transcript.text ?? "",
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Assembly webhook handler error:", err);
    await supabase
      .from("bot_sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

function buildTranscriptText(transcript: AssemblyTranscript): string {
  const lines: string[] = [
    `Přepis: ${transcript.id}`,
    `Datum: ${new Date().toLocaleDateString("cs-CZ")}`,
    "---",
    "",
  ];

  if (transcript.utterances && transcript.utterances.length > 0) {
    for (const utt of transcript.utterances) {
      const time = formatMs(utt.start);
      lines.push(`[${time}] ${utt.speaker}: ${utt.text}`);
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
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function uploadToDrive(
  userEmail: string,
  title: string,
  content: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string | null> {
  // Načti user settings (Drive folder)
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("drive_folder_id")
    .eq("user_email", userEmail)
    .single();

  // Potřebujeme access token uživatele – ale ten nemáme v webhook kontextu
  // TODO: Uložit refresh token do DB při prvním přihlášení a použít ho zde
  // Pro nyní jen logujeme
  console.log("Drive upload TODO for user:", userEmail, "folder:", userSettings?.drive_folder_id);
  return null;
}

interface AssemblyUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface AssemblyTranscript {
  id: string;
  text?: string;
  utterances?: AssemblyUtterance[];
}
