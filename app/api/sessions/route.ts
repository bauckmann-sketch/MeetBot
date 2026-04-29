import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const { data: sessions, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("user_email", session.user.email)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Doplň počet mluvčích z transcript_data
  const sessionIds = (sessions ?? []).map((s) => s.id);
  let speakerCounts: Record<string, number> = {};

  if (sessionIds.length > 0) {
    const { data: transcripts } = await supabase
      .from("transcript_data")
      .select("session_id, utterances")
      .in("session_id", sessionIds);

    if (transcripts) {
      for (const t of transcripts) {
        const utterances = t.utterances ?? [];
        const uniqueSpeakers = new Set(
          utterances.map((u: { speaker: string }) => u.speaker)
        );
        speakerCounts[t.session_id] = uniqueSpeakers.size;
      }
    }
  }

  // Přidej speaker_count ke každé session
  const enriched = (sessions ?? []).map((s) => ({
    ...s,
    speaker_count: speakerCounts[s.id] ?? 0,
  }));

  return NextResponse.json({ sessions: enriched });
}
