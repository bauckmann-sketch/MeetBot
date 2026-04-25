import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";
import {
  getAccessTokenFromRefresh,
  uploadTranscriptToDrive,
  uploadRecordingToDrive,
} from "@/lib/google-drive";

/**
 * POST – Manuální uložení záznamu/přepisu na Drive pro konkrétní session
 * Volá se z UI tlačítkem "Uložit na Drive" u hotových sessions
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const supabase = createServerClient();

  // Načti bot session
  const { data: botSession } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_email", session.user.email)
    .single();

  if (!botSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Načti user settings (Drive folder)
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("drive_folder_id")
    .eq("user_email", session.user.email)
    .single();

  if (!userSettings?.drive_folder_id) {
    return NextResponse.json(
      { error: "Nastavte nejdřív složku na Google Drivu v Nastavení" },
      { status: 400 }
    );
  }

  // Načti refresh token
  const { data: tokenData } = await supabase
    .from("user_tokens")
    .select("google_refresh_token")
    .eq("user_email", session.user.email)
    .single();

  if (!tokenData?.google_refresh_token) {
    return NextResponse.json(
      { error: "Chybí Google token – odhlaste se a přihlaste znovu" },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getAccessTokenFromRefresh(tokenData.google_refresh_token);

    let driveTranscriptUrl = botSession.drive_transcript_url;
    let driveRecordingUrl = botSession.drive_recording_url;

    // Nahrát přepis pokud ještě není na Drivu
    if (!driveTranscriptUrl) {
      // Stáhni přepis z DB
      const { data: transcriptData } = await supabase
        .from("transcript_data")
        .select("utterances, text")
        .eq("session_id", sessionId)
        .single();

      if (transcriptData) {
        const txtContent = buildTranscriptText(
          transcriptData.utterances ?? [],
          transcriptData.text ?? "",
          botSession.event_title
        );
        driveTranscriptUrl = await uploadTranscriptToDrive(
          accessToken,
          userSettings.drive_folder_id,
          botSession.event_title,
          txtContent
        );
      }
    }

    // Nahrát záznam pokud ještě není na Drivu
    if (!driveRecordingUrl && botSession.recall_recording_url) {
      driveRecordingUrl = await uploadRecordingToDrive(
        accessToken,
        userSettings.drive_folder_id,
        botSession.event_title,
        botSession.recall_recording_url
      );
    }

    // Ulož Drive URLs do DB
    await supabase.from("bot_sessions").update({
      drive_transcript_url: driveTranscriptUrl,
      drive_recording_url: driveRecordingUrl,
    }).eq("id", sessionId);

    return NextResponse.json({
      drive_transcript_url: driveTranscriptUrl,
      drive_recording_url: driveRecordingUrl,
    });
  } catch (err) {
    console.error("Manual Drive upload error:", err);
    return NextResponse.json(
      { error: "Nepodařilo se nahrát na Drive" },
      { status: 500 }
    );
  }
}

function buildTranscriptText(
  utterances: Array<{ speaker: string; text: string; start: number }>,
  fullText: string,
  eventTitle: string
): string {
  const lines: string[] = [
    `📝 Přepis: ${eventTitle}`,
    `Datum: ${new Date().toLocaleDateString("cs-CZ")}`,
    "═══════════════════════════════════════",
    "",
  ];

  if (utterances.length > 0) {
    let currentSpeaker = "";
    for (const utt of utterances) {
      const time = formatMs(utt.start);
      if (utt.speaker !== currentSpeaker) {
        currentSpeaker = utt.speaker;
        lines.push("");
        lines.push(`── Mluvčí ${utt.speaker} ──`);
      }
      lines.push(`  [${time}] ${utt.text}`);
    }
  } else {
    lines.push(fullText || "(prázdný přepis)");
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
