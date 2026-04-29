"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { BotSession } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { showToast } from "@/components/ToastContainer";

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
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then(({ sessions }) => setSessions(sessions ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveToDrive(sessionId: string) {
    setUploading((prev) => new Set(prev).add(sessionId));
    try {
      const res = await fetch(`/api/sessions/${sessionId}/drive`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      // Aktualizuj session v lokálním stavu
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                drive_transcript_url: data.drive_transcript_url ?? s.drive_transcript_url,
                drive_recording_url: data.drive_recording_url ?? s.drive_recording_url,
              }
            : s
        )
      );
      showToast("Uloženo na Google Drive ✅", "success");
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Chyba při nahrávání na Drive",
        "error"
      );
    } finally {
      setUploading((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatTimeRange(start: string, end: string | null) {
    const from = formatTime(start);
    if (!end) return from;
    return `${from} – ${formatTime(end)}`;
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
                  <th>Čas</th>
                  <th>Název</th>
                  <th>Účastníci</th>
                  <th>Platforma</th>
                  <th>Délka</th>
                  <th>Status</th>
                  <th>Cena</th>
                  <th>Drive</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const st = STATUS_LABELS[s.status] ?? { label: s.status, cls: "" };
                  const totalCost =
                    (s.cost_bot_usd ?? 0) + (s.cost_transcript_usd ?? 0);
                  const hasDriveFiles = s.drive_transcript_url || s.drive_recording_url;
                  const canUpload = s.status === "done" && !hasDriveFiles;
                  const isUploading = uploading.has(s.id);

                  return (
                    <tr key={s.id}>
                      <td className="text-muted text-sm">{formatDate(s.created_at)}</td>
                      <td className="text-sm" style={{ whiteSpace: "nowrap" }}>
                        {formatTimeRange(s.created_at, s.ended_at)}
                      </td>
                      <td>
                        <a
                          href={`/transcript/${s.id}`}
                          className="font-semibold"
                          style={{ color: "var(--text-primary)", textDecoration: "underline dotted" }}
                        >
                          {s.event_title}
                        </a>
                      </td>
                      <td className="text-sm">
                        {(s as unknown as { speaker_count?: number }).speaker_count
                          ? `👥 ${(s as unknown as { speaker_count?: number }).speaker_count}`
                          : <span className="text-muted">—</span>
                        }
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
                      <td>
                        {hasDriveFiles ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {s.drive_transcript_url && (
                              <a
                                href={s.drive_transcript_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge badge-done"
                                style={{ textDecoration: "none", cursor: "pointer" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                📄 Přepis
                              </a>
                            )}
                            {s.drive_recording_url && (
                              <a
                                href={s.drive_recording_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge badge-done"
                                style={{ textDecoration: "none", cursor: "pointer" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                🎥 Záznam
                              </a>
                            )}
                          </div>
                        ) : canUpload ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveToDrive(s.id);
                            }}
                            disabled={isUploading}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {isUploading ? (
                              <span className="spinner" style={{ width: 14, height: 14 }} />
                            ) : (
                              "☁️ Uložit na Drive"
                            )}
                          </button>
                        ) : (
                          <span className="text-muted text-sm">—</span>
                        )}
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
