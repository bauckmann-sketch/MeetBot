import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase";
import { createId } from "@paralleldrive/cuid2";
import { detectPlatform, getMeetingUrl } from "@/lib/utils";
import { google } from "googleapis";
import type { CalendarEvent } from "@/lib/types";

const BOT_EMAIL = process.env.BOT_GOOGLE_EMAIL || "meetbot-inovatix@gmail.com";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { event }: { event: CalendarEvent } = body;

  if (!event?.id || !event.summary) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  const platform = detectPlatform(event);
  const meetingUrl = getMeetingUrl(event);

  if (!meetingUrl) {
    return NextResponse.json({ error: "No meeting URL in event" }, { status: 400 });
  }

  const supabase = createServerClient();
  const sessionId = createId();

  // Uložíme session do DB
  const { error: dbError } = await supabase.from("bot_sessions").insert({
    id: sessionId,
    user_email: session.user.email,
    event_id: event.id,
    event_title: event.summary,
    meeting_url: meetingUrl,
    meeting_platform: platform,
    status: "pending",
  });

  if (dbError) {
    console.error("DB insert error:", dbError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Automaticky přidej bot email na kalendářní pozvánku (aby přeskočil waiting room)
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Načti aktuální attendees
    const eventDetail = await calendar.events.get({
      calendarId: "primary",
      eventId: event.id,
    });

    const existingAttendees = eventDetail.data.attendees || [];
    const botAlreadyInvited = existingAttendees.some(
      (a) => a.email?.toLowerCase() === BOT_EMAIL.toLowerCase()
    );

    if (!botAlreadyInvited) {
      await calendar.events.patch({
        calendarId: "primary",
        eventId: event.id,
        sendUpdates: "none", // Nepošle email notifikaci účastníkům
        requestBody: {
          attendees: [
            ...existingAttendees,
            { email: BOT_EMAIL, responseStatus: "accepted" },
          ],
        },
      });
      console.log(`Bot email ${BOT_EMAIL} added to calendar event ${event.id}`);
    }
  } catch (err) {
    // Neblokujeme dispatch – bot se může připojit i bez pozvánky
    console.warn("Failed to add bot to calendar event:", err);
  }

  // Načti jméno bota z nastavení
  const { data: settings } = await supabase.from("settings").select("bot_name").single();
  const botName = settings?.bot_name || "MeetBot";

  // Odešle Recall bot
  try {
    const recallResponse = await fetch("https://us-west-2.recall.ai/api/v1/bot/", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.RECALL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: botName,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/recall/webhook`,
        metadata: { session_id: sessionId },
        // Konfigurace timeoutů
        automatic_leave: {
          waiting_room_timeout: 3600,       // 60 min ve waiting room (záloha)
          noone_joined_timeout: 3600,       // 60 min čekání na prvního účastníka
          everyone_left_timeout: {
            timeout: 120,                   // 2 min po odchodu všech
            activate_after: null,
          },
        },
      }),
    });

    if (!recallResponse.ok) {
      const errText = await recallResponse.text();
      console.error("Recall API error:", recallResponse.status, errText);
      await supabase
        .from("bot_sessions")
        .update({ status: "failed" })
        .eq("id", sessionId);
      let errDetail: unknown;
      try { errDetail = JSON.parse(errText); } catch { errDetail = errText; }
      return NextResponse.json(
        { error: "Recall API failed", status: recallResponse.status, detail: errDetail },
        { status: 500 }
      );
    }

    const recallData = await recallResponse.json();

    await supabase
      .from("bot_sessions")
      .update({ recall_bot_id: recallData.id, status: "dispatched" })
      .eq("id", sessionId);

    return NextResponse.json({ success: true, sessionId, botId: recallData.id });
  } catch (err) {
    console.error("Recall dispatch error:", err);
    await supabase
      .from("bot_sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);
    return NextResponse.json({ error: "Failed to dispatch bot" }, { status: 500 });
  }
}
