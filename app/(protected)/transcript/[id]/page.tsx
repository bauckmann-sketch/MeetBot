"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import type { BotSession } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

const SPEAKER_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a78bfa", "#ec4899",
];

interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface SpeakerNameMap {
  [key: string]: string;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts
    .map((p, i) =>
      new RegExp(escaped, "gi").test(p)
        ? `<mark class="highlight">${p}</mark>`
        : p
    )
    .join("");
}

export default function TranscriptPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<BotSession | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [speakerNames, setSpeakerNames] = useState<SpeakerNameMap>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then(({ session, transcript }) => {
        setSession(session);
        setUtterances(transcript?.utterances ?? []);
        // Inicializuj jména mluvčích
        const speakers = [...new Set((transcript?.utterances ?? []).map((u: Utterance) => u.speaker))];
        const names: SpeakerNameMap = {};
        speakers.forEach((s, i) => { names[s as string] = `Speaker ${String.fromCharCode(65 + i)}`; });
        setSpeakerNames(names);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const speakers = [...new Set(utterances.map((u) => u.speaker))];

  const filtered = utterances.filter((u) => {
    if (activeFilter && u.speaker !== activeFilter) return false;
    if (search && !u.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function getSpeakerColor(speaker: string) {
    const idx = speakers.indexOf(speaker);
    return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
  }

  function downloadTxt() {
    const lines = utterances.map(
      (u) => `[${formatMs(u.start)}] ${speakerNames[u.speaker] ?? u.speaker}: ${u.text}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session?.event_title ?? "transcript"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadJson() {
    const data = utterances.map((u) => ({
      time: formatMs(u.start),
      start_ms: u.start,
      end_ms: u.end,
      speaker: speakerNames[u.speaker] ?? u.speaker,
      text: u.text,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session?.event_title ?? "transcript"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /></div>;
  }

  if (!session) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Záznam nenalezen</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="page-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <div className="flex items-center gap-3 mb-4">
          <a href="/recordings" className="btn btn-ghost btn-sm">← Záznamy</a>
        </div>
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{session.event_title}</h1>
            <div className="flex gap-3 items-center">
              <span className="text-sm text-muted">
                {new Date(session.created_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              {session.duration_secs && (
                <span className="text-sm text-muted">· {formatDuration(session.duration_secs)}</span>
              )}
              {session.meeting_platform && (
                <span className={`badge badge-${session.meeting_platform}`}>
                  {session.meeting_platform === "meet" ? "🎥 Meet" : session.meeting_platform === "zoom" ? "💻 Zoom" : "🟦 Teams"}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={downloadTxt}>📥 TXT</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadJson}>📊 JSON</button>
            {session.drive_transcript_url && (
              <a
                href={session.drive_transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                🔗 Drive
              </a>
            )}
          </div>
        </div>
      </div>

      {utterances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">
            {session.status === "processing" ? "Přepis se zpracovává…" : "Přepis není k dispozici"}
          </div>
          <div className="empty-state-desc">
            {session.status === "processing"
              ? "Přepis bude hotov za několik minut."
              : "Tento záznam nemá dostupný přepis."}
          </div>
        </div>
      ) : (
        <div className="transcript-layout">
          {/* Mluvčí panel */}
          <aside className="speakers-panel">
            <div className="card card-sm">
              <div className="section-title">👤 Mluvčí</div>
              <div className="flex flex-col gap-2">
                <div
                  className={`speaker-chip ${activeFilter === null ? "active" : ""}`}
                  onClick={() => setActiveFilter(null)}
                >
                  <div className="speaker-dot" style={{ background: "var(--text-muted)" }} />
                  <span className="speaker-label">Všichni</span>
                </div>
                {speakers.map((speaker, idx) => (
                  <div
                    key={speaker}
                    className={`speaker-chip ${activeFilter === speaker ? "active" : ""}`}
                    onClick={() => setActiveFilter(activeFilter === speaker ? null : speaker)}
                  >
                    <div
                      className="speaker-dot"
                      style={{ background: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }}
                    />
                    <span className="speaker-label">
                      {speakerNames[speaker] ?? speaker}
                    </span>
                  </div>
                ))}
              </div>

              <hr className="divider" />

              {/* Přejmenování mluvčích */}
              <div className="section-title" style={{ fontSize: 12, marginBottom: 10 }}>Přejmenovat</div>
              {speakers.map((speaker) => (
                <div key={speaker} className="flex flex-col gap-2 mb-4">
                  <label className="label" style={{ fontSize: 11 }}>
                    {speaker}
                  </label>
                  <input
                    className="input"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                    value={speakerNames[speaker] ?? speaker}
                    onChange={(e) =>
                      setSpeakerNames((prev) => ({ ...prev, [speaker]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </aside>

          {/* Přepis */}
          <div>
            <div className="search-wrap">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="input"
                placeholder="Hledat v přepisu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="transcript-entries">
              {filtered.map((utt, i) => {
                const color = getSpeakerColor(utt.speaker);
                const displayName = speakerNames[utt.speaker] ?? utt.speaker;
                const highlightedText = highlight(utt.text, search);

                return (
                  <div className="transcript-entry" key={i}>
                    <div className="transcript-time">{formatMs(utt.start)}</div>
                    <div className="transcript-text">
                      <div className="transcript-speaker" style={{ color }}>
                        {displayName}
                      </div>
                      <div
                        className="transcript-words"
                        dangerouslySetInnerHTML={{ __html: highlightedText }}
                      />
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-title">Nic nenalezeno</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
