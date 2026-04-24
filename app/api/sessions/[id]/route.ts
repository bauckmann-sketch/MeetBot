import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data: botSession, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_email", session.user.email)
    .single();

  if (error || !botSession) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Načti transcript data
  const { data: transcriptData } = await supabase
    .from("transcript_data")
    .select("utterances, text")
    .eq("session_id", id)
    .single();

  return NextResponse.json({ session: botSession, transcript: transcriptData });
}
