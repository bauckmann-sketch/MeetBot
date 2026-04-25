import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createHmac } from "crypto";
import {
  getAccessTokenFromRefresh,
  uploadTranscriptToDrive,
  uploadRecordingToDrive,
} from "@/lib/google-drive";

/**
 * AssemblyAI Webhook – přepis dokončen
 * Stáhne výsledek, nahraje na Drive (přepis prioritně, video best-effort), aktualizuje DB
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
    const txtContent = buildTranscriptText(transcript, botSession.event_title);

    // Ulož utterances do DB
    const utterances = transcript.utterances ?? [];

    // === GOOGLE DRIVE UPLOAD ===
    let driveTranscriptUrl: string | null = null;
    let driveRecordingUrl: string | null = null;

    try {
      driveTranscriptUrl = await uploadToDriveWithRefreshToken(
        botSession.user_email,
        botSession.event_title,
        txtContent,
        botSession.recall_recording_url,
        supabase
      ).then(r => r.transcriptUrl);

      // Video upload (best-effort, po transkriptu)
      if (botSession.recall_recording_url) {
        driveRecordingUrl = await uploadRecordingWithRefreshToken(
          botSession.user_email,
          botSession.event_title,
          botSession.recall_recording_url,
          supabase
        );
      }
    } catch (driveErr) {
      console.error("Drive upload error:", driveErr);
      // Nepřeruš – přepis je už v DB
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
      drive_recording_url: driveRecordingUrl,
      cost_bot_usd: costBot,
      cost_transcript_usd: costTranscript,
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

function buildTranscriptText(transcript: AssemblyTranscript, eventTitle: string): string {
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
        lines.push(""); // prázdný řádek mezi mluvčími
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
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Nahraje transkript na Google Drive s refresh tokenem z DB
 * PRIORITNÍ – musí projít
 */
async function uploadToDriveWithRefreshToken(
  userEmail: string,
  title: string,
  content: string,
  _recordingUrl: string | null,
  supabase: ReturnType<typeof createServerClient>
): Promise<{ transcriptUrl: string | null }> {
  // Načti Drive folder ID
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("drive_folder_id")
    .eq("user_email", userEmail)
    .single();

  if (!userSettings?.drive_folder_id) {
    console.log("No Drive folder configured for user:", userEmail);
    return { transcriptUrl: null };
  }

  // Načti refresh token z DB
  const { data: tokenData } = await supabase
    .from("user_tokens")
    .select("google_refresh_token")
    .eq("user_email", userEmail)
    .single();

  if (!tokenData?.google_refresh_token) {
    console.error("No refresh token found for user:", userEmail);
    return { transcriptUrl: null };
  }

  // Získej čerstvý access token
  const accessToken = await getAccessTokenFromRefresh(tokenData.google_refresh_token);

  // Nahrát přepis (PRIORITA)
  const transcriptUrl = await uploadTranscriptToDrive(
    accessToken,
    userSettings.drive_folder_id,
    title,
    content
  );

  return { transcriptUrl };
}

/**
 * Nahraje záznam na Google Drive – BEST EFFORT
 */
async function uploadRecordingWithRefreshToken(
  userEmail: string,
  title: string,
  videoUrl: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string | null> {
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("drive_folder_id")
    .eq("user_email", userEmail)
    .single();

  if (!userSettings?.drive_folder_id) return null;

  const { data: tokenData } = await supabase
    .from("user_tokens")
    .select("google_refresh_token")
    .eq("user_email", userEmail)
    .single();

  if (!tokenData?.google_refresh_token) return null;

  const accessToken = await getAccessTokenFromRefresh(tokenData.google_refresh_token);

  return uploadRecordingToDrive(
    accessToken,
    userSettings.drive_folder_id,
    title,
    videoUrl
  );
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
