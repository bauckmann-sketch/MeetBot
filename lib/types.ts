export type MeetingPlatform = "meet" | "zoom" | "teams" | null;

export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
  };
}

export interface BotSession {
  id: string;
  user_email: string;
  recall_bot_id: string | null;
  assembly_job_id: string | null;
  event_id: string;
  event_title: string;
  meeting_url: string;
  meeting_platform: MeetingPlatform;
  status: "pending" | "dispatched" | "joined" | "processing" | "done" | "failed";
  duration_secs: number | null;
  cost_bot_usd: number | null;
  cost_transcript_usd: number | null;
  recall_recording_url: string | null;
  drive_video_url: string | null;
  drive_transcript_url: string | null;
  drive_folder_id: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface AllowedUser {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  added_at: string;
}

export interface UserSettings {
  user_email: string;
  drive_folder_id: string;
  drive_folder_name: string;
  updated_at: string;
}

export interface CostLog {
  id: string;
  session_id: string;
  user_email: string;
  log_date: string;
  type: "bot" | "transcription" | "storage";
  amount_usd: number;
  note: string | null;
  created_at: string;
}
