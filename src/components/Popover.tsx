import { useEffect, useState } from "react";
import { tauri, type SessionState } from "../api/tauri";
import { RecentMeetings } from "./RecentMeetings";

export function Popover() {
  const [state, setState] = useState<SessionState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await tauri.sessionState();
        if (!cancelled) setState(s);
      } catch {}
    };
    void load();
    const i = window.setInterval(() => void load(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, []);

  const isRecording = state.kind === "recording";

  const toggle = async () => {
    if (isRecording) {
      await tauri.toggleSession();
    } else {
      const wins = await tauri.getWindows();
      const first = wins[0];
      if (!first) return;
      await tauri.startSession(first.id, first.title);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>Moment</strong>
        <span style={{ fontSize: 11, color: isRecording ? "#dc3545" : "#666" }}>
          {isRecording ? "● recording" : "idle"}
        </span>
      </div>
      <button
        onClick={() => void toggle()}
        style={{
          marginTop: 10,
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: "none",
          background: isRecording ? "#dc3545" : "#0d6efd",
          color: "white",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {isRecording ? "Stop" : "Start (first visible window)"}
      </button>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Recent</div>
        <RecentMeetings limit={1} />
      </div>
    </div>
  );
}
