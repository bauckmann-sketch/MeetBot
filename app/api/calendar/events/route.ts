import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { google } from "googleapis";
import type { CalendarEvent } from "@/lib/types";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
      fields:
        "items(id,summary,start,end,hangoutLink,conferenceData)",
    });

    const events: CalendarEvent[] = (response.data.items || []).filter(
      (e) => e.start?.dateTime // jen časově ohraničené události (ne celodenní)
    ) as CalendarEvent[];

    return NextResponse.json({ events });
  } catch (err: unknown) {
    console.error("Calendar API error:", err);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
