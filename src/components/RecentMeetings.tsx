import { useEffect, useState } from "react";
import { tauri, type MeetingRow } from "../api/tauri";

export function RecentMeetings({ limit = 1 }: { limit?: number }) {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await tauri.getRecentMeetings(limit);
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    };
    void load();
    const i = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [limit]);

  if (err) return <div style={{ fontSize: 12, color: "#dc3545" }}>{err}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 12, color: "#888" }}>No meetings yet.</div>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map((m) => (
        <li key={m.id} style={{ padding: "6px 0", borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>
            {new Date(m.startedAt).toLocaleString()} {m.endedAt ? " · ended" : " · in progress"}
          </div>
        </li>
      ))}
    </ul>
  );
}
