-- ================================================================
-- MeetBot – Supabase schema
-- Spusť v Supabase SQL Editoru: https://app.supabase.com → SQL Editor
-- ================================================================

-- Globální nastavení systému
CREATE TABLE IF NOT EXISTS settings (
  id          SERIAL PRIMARY KEY,  -- vždy 1 řádek
  bot_name    TEXT DEFAULT 'MeetBot',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Inicializuj default nastavení
INSERT INTO settings (id, bot_name) VALUES (1, 'MeetBot')
ON CONFLICT (id) DO NOTHING;

-- Povolení uživatelé (whitelist)
CREATE TABLE IF NOT EXISTS allowed_users (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  is_admin   BOOLEAN DEFAULT FALSE,
  added_at   TIMESTAMPTZ DEFAULT NOW()
);

-- PRVNÍ UŽIVATEL – přidej svůj email jako admin!
-- INSERT INTO allowed_users (email, name, is_admin) VALUES ('tvuj@email.cz', 'Tvoje Jméno', TRUE);

-- Uživatelská nastavení (jedno per user)
CREATE TABLE IF NOT EXISTS user_settings (
  user_email        TEXT PRIMARY KEY,
  drive_folder_id   TEXT DEFAULT '',
  drive_folder_name TEXT DEFAULT '',
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Každý odeslaný bot = jeden session záznam
CREATE TABLE IF NOT EXISTS bot_sessions (
  id                    TEXT PRIMARY KEY,
  user_email            TEXT NOT NULL,
  recall_bot_id         TEXT,
  assembly_job_id       TEXT,
  event_id              TEXT NOT NULL,
  event_title           TEXT NOT NULL,
  meeting_url           TEXT NOT NULL,
  meeting_platform      TEXT,               -- 'meet' | 'zoom' | 'teams'
  status                TEXT DEFAULT 'pending',
  -- pending → dispatched → joined → processing → done | failed
  duration_secs         INTEGER,
  cost_bot_usd          NUMERIC(10,4),      -- $0.50/hod
  cost_transcript_usd   NUMERIC(10,4),      -- $0.37/hod
  recall_recording_url  TEXT,
  drive_video_url       TEXT,
  drive_transcript_url  TEXT,
  drive_folder_id       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  ended_at              TIMESTAMPTZ
);

-- Index pro rychlé vyhledávání podle recall_bot_id
CREATE INDEX IF NOT EXISTS idx_bot_sessions_recall_bot_id ON bot_sessions(recall_bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_email ON bot_sessions(user_email);

-- Přepisy (utterances)
CREATE TABLE IF NOT EXISTS transcript_data (
  session_id  TEXT PRIMARY KEY REFERENCES bot_sessions(id) ON DELETE CASCADE,
  utterances  JSONB,         -- pole utterance objektů
  text        TEXT,          -- celý přepis jako plain text
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Položkový cost log pro admin dashboard
CREATE TABLE IF NOT EXISTS cost_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  TEXT REFERENCES bot_sessions(id) ON DELETE SET NULL,
  user_email  TEXT,
  log_date    DATE NOT NULL,
  type        TEXT NOT NULL,  -- 'bot' | 'transcription' | 'storage'
  amount_usd  NUMERIC(10,4) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_logs_user_email ON cost_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_cost_logs_log_date ON cost_logs(log_date);

-- ================================================================
-- Row Level Security (volitelné – pokud chceš jistotu)
-- Pro jednoduchost momentálně používáme service role key ze serveru
-- a RLS necháváme vypnuté
-- ================================================================
