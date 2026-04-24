"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { BotSession } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Čeká",        cls: "badge-pending" },
  dispatched:  { label: "Odesíláno",   cls: "badge-dispatched" },
  joined:      { label: "● Živě",      cls: "badge-joined" },
  processing:  { label: "⏳ Přepis",   cls: "badge-processing" },
  done:        { label: "✅ Hotovo",    cls: "badge-done" },
  failed:      { label: "❌ Chyba",    cls: "badge-failed" },
};

const PLATFORM_LABELS: Record<string, string> = {
  meet:  "🎥 Meet",
  zoom:  "💻 Zoom",
  teams: "🟦 Teams",
};

export default function RecordingsPage() {
  const [sessions, setSessions] = useState<BotSession[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then(({ sessions }) => setSessions(sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">📋 Záznamy</h1>
          <p className="page-subtitle">Všechny vaše odesílané boty a přepisy</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="loading-overlay"><div className="spinner" /></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">Žádné záznamy</div>
            <div className="empty-state-desc">
              Zatím jste neodeslali žádného bota. Přejděte do Kalendáře a zapněte bot pro nadcházející schůzku.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Název</th>
                  <th>Platforma</th>
                  <th>Délka</th>
                  <th>Status</th>
                  <th>Cena</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const st = STATUS_LABELS[s.status] ?? { label: s.status, cls: "" };
                  const totalCost =
                    (s.cost_bot_usd ?? 0) + (s.cost_transcript_usd ?? 0);

                  return (
                    <tr key={s.id} onClick={() => router.push(`/transcript/${s.id}`)}>
                      <td className="text-muted text-sm">{formatDate(s.created_at)}</td>
                      <td>
                        <span className="font-semibold">{s.event_title}</span>
                      </td>
                      <td>
                        {s.meeting_platform ? (
                          <span className={`badge badge-${s.meeting_platform}`}>
                            {PLATFORM_LABELS[s.meeting_platform] ?? s.meeting_platform}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-sm">
                        {s.duration_secs ? formatDuration(s.duration_secs) : "—"}
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="text-sm">
                        {totalCost > 0 ? `$${totalCost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
