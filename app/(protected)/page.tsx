"use client";

import { useState, useEffect, useCallback } from "react";
import { formatEventDate, formatEventTime, platformLabel, isEventLive, detectPlatform } from "@/lib/utils";
import type { CalendarEvent, BotSession, MeetingPlatform } from "@/lib/types";
import { showToast } from "@/components/ToastContainer";

interface EventWithBot {
  event: CalendarEvent;
  session: BotSession | null;
  platform: MeetingPlatform;
}

export default function DashboardPage() {
  const [items, setItems] = useState<EventWithBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, sessionsRes] = await Promise.all([
        fetch("/api/calendar/events"),
        fetch("/api/sessions"),
      ]);
      if (!eventsRes.ok || !sessionsRes.ok) {
        showToast("Chyba při načítání dat", "error");
        return;
      }
      const { events } = await eventsRes.json();
      const { sessions } = await sessionsRes.json();

      // Spáruj events se sessions
      const sessionsByEvent = new Map<string, BotSession>();
      for (const s of sessions as BotSession[]) {
        sessionsByEvent.set(s.event_id, s);
      }

      setItems(
        (events as CalendarEvent[]).map((event) => ({
          event,
          session: sessionsByEvent.get(event.id) ?? null,
          platform: detectPlatform(event),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh každých 30s
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleToggle(item: EventWithBot) {
    const eventId = item.event.id;
    setDispatching((prev) => new Set(prev).add(eventId));
    try {
      if (item.session) {
        // Vypnout bota
        const res = await fetch("/api/bot/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: item.session.id }),
        });
        if (!res.ok) throw new Error();
        showToast("Bot zrušen", "info");
      } else {
        // Zapnout bota
        const res = await fetch("/api/bot/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: item.event }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        showToast("Bot odeslán na schůzku! ✅", "success");
      }
      await loadData();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Chyba při komunikaci se serverem",
        "error"
      );
    } finally {
      setDispatching((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  const now = new Date().toLocaleString("cs-CZ", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">📅 Kalendář</h1>
          <p className="page-subtitle">Příštích 14 dní · Aktualizováno {now}</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "↻"} Obnovit
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-title">Žádné schůzky</div>
          <div className="empty-state-desc">V příštích 14 dnech nejsou žádné schůzky s videem</div>
        </div>
      ) : (
        <div className="events-grid">
          {items.map(({ event, session, platform }) => {
            const startDT = event.start.dateTime!;
            const endDT = event.end.dateTime!;
            const live = isEventLive(startDT, endDT);
            const plat = platformLabel(platform);
            const isOn = !!session;
            const isBusy = dispatching.has(event.id);
            const hasNoLink = !platform;
            const sessionDone = session?.status === "done";

            return (
              <div className="event-row" key={event.id}>
                {/* Čas */}
                <div className="event-time">
                  <span className="event-date-label">{formatEventDate(startDT)}</span>
                  <span className="event-time-label">{formatEventTime(startDT)}</span>
                </div>

                {/* Název + status */}
                <div className="event-title-row">
                  <span className="event-title">{event.summary}</span>
                  {live && <span className="badge badge-live">● LIVE</span>}
                  {sessionDone && <span className="badge badge-done">✓ Hotovo</span>}
                  {session?.status === "processing" && <span className="badge badge-processing">⏳ Přepis</span>}
                  {session?.status === "joined" && <span className="badge badge-dispatched">● Živě</span>}
                </div>

                {/* Platforma */}
                <div className="event-platform">
                  {platform ? (
                    <span className={`badge badge-${platform}`}>
                      {plat.emoji} {plat.name}
                    </span>
                  ) : (
                    <span className="text-muted text-sm">—</span>
                  )}
                </div>

                {/* Toggle */}
                <div className="event-bot-toggle">
                  {isBusy ? (
                    <div className="spinner" />
                  ) : (
                    <label className="toggle-wrap" title={hasNoLink ? "Žádný meeting link" : undefined}>
                      <input
                        type="checkbox"
                        checked={isOn}
                        disabled={hasNoLink || sessionDone || isBusy}
                        onChange={() => handleToggle({ event, session, platform })}
                      />
                      <span className="toggle-slider" />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
