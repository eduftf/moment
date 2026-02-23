import type { Moment } from "../types";

interface Props {
  moments: Moment[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function triggerLabel(m: Moment): string {
  if (m.trigger === "reaction") return "thumbs up";
  if (m.trigger === "peak") return `Peak: ${m.participantCount}`;
  return "manual";
}

export function MomentsList({ moments }: Props) {
  if (moments.length === 0) {
    return (
      <div className="section">
        <h3>Moments</h3>
        <p className="muted">No moments captured yet</p>
      </div>
    );
  }

  return (
    <div className="section">
      <h3>Moments ({moments.length})</h3>
      <ul className="moments-list">
        {moments.map((m) => (
          <li key={m.id} className="moment-item">
            <span className={`capture-icon ${m.captured ? "auto" : "manual"}`}>
              {m.captured ? "A" : "M"}
            </span>
            <span>{formatTime(m.timestamp)}</span>
            <span className="muted"> — {triggerLabel(m)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
