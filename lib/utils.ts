import type { CalendarEvent, MeetingPlatform } from "./types";

/**
 * Detekuje platformu meetingu z Google Calendar události
 */
export function detectPlatform(event: CalendarEvent): MeetingPlatform {
  const url =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri ??
    event.conferenceData?.entryPoints?.[0]?.uri ??
    "";

  if (url.includes("meet.google.com")) return "meet";
  if (url.includes("zoom.us")) return "zoom";
  if (url.includes("teams.microsoft") || url.includes("teams.live.com"))
    return "teams";
  return null;
}

/**
 * Vrátí URL meetingu z Google Calendar události
 */
export function getMeetingUrl(event: CalendarEvent): string {
  return (
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri ??
    ""
  );
}

/**
 * Formátuje datum pro zobrazení (česky)
 */
export function formatEventDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (d.toDateString() === now.toDateString()) {
    return "Dnes";
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return "Zítra";
  }
  return d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
}

/**
 * Formátuje čas pro zobrazení
 */
export function formatEventTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Vrátí emoji/label pro platformu
 */
export function platformLabel(platform: MeetingPlatform): { emoji: string; name: string } {
  switch (platform) {
    case "meet":
      return { emoji: "🎥", name: "Meet" };
    case "zoom":
      return { emoji: "💻", name: "Zoom" };
    case "teams":
      return { emoji: "🟦", name: "Teams" };
    default:
      return { emoji: "📹", name: "Unknown" };
  }
}

/**
 * Vrátí true pokud meeting právě probíhá
 */
export function isEventLive(startIso: string, endIso: string): boolean {
  const now = Date.now();
  return new Date(startIso).getTime() <= now && new Date(endIso).getTime() >= now;
}

/**
 * Formátuje délku v sekundách na „X min"
 */
export function formatDuration(secs: number): string {
  const min = Math.round(secs / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
