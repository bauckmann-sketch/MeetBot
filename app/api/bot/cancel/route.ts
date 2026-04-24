import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Zkontroluj ownership
  const { data: botSession } = await supabase
    .from("bot_sessions")
    .select("recall_bot_id, user_email, status")
    .eq("id", sessionId)
    .single();

  if (!botSession || botSession.user_email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!botSession.recall_bot_id || botSession.status === "done") {
    // Jen smažeme z DB, bot už není aktivní
    await supabase.from("bot_sessions").delete().eq("id", sessionId);
    return NextResponse.json({ success: true });
  }

  // Pokus o zrušení bota přes Recall API
  try {
    await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botSession.recall_bot_id}/leave_call/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.RECALL_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Recall cancel error:", err);
  }

  await supabase.from("bot_sessions").delete().eq("id", sessionId);

  return NextResponse.json({ success: true });
}
