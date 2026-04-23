import { invoke } from "@tauri-apps/api/core";

export type WindowInfo = {
  id: number;
  title: string;
  app: string;
  bounds: { x: number; y: number; width: number; height: number };
};

export type SessionState =
  | { kind: "idle" }
  | { kind: "selecting" }
  | { kind: "recording"; meetingId: string; windowId: number; startedAt: string }
  | { kind: "finalizing"; meetingId: string }
  | { kind: "done"; meetingId: string };

export type MeetingRow = {
  id: string;
  title: string;
  path: string;
  startedAt: string;
  endedAt: string | null;
  peak: number;
};

export const tauri = {
  getWindows: () => invoke<WindowInfo[]>("get_windows"),
  startSession: (windowId: number, title: string | null) =>
    invoke<SessionState>("start_session", { windowId, title }),
  stopSession: () => invoke<SessionState>("stop_session"),
  sessionState: () => invoke<SessionState>("session_state"),
  captureManual: () => invoke<string>("capture_manual"),
  grantedPermissions: () => invoke<{ screen: boolean }>("granted_permissions"),
  openScreenRecordingPrefs: () => invoke<void>("open_screen_recording_prefs"),
  getRecentMeetings: (limit: number = 1) =>
    invoke<MeetingRow[]>("get_recent_meetings", { limit }),
  toggleSession: (windowId?: number, title?: string | null) =>
    invoke<SessionState>("toggle_session", { windowId, title: title ?? null })
};
