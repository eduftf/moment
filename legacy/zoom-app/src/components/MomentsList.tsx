import { useState } from "react";
import type { Moment } from "../types";

interface Props {
  moments: Moment[];
  onDeleteMoment?: (id: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const defaultEmoji: Record<Moment["trigger"], string> = {
  reaction: "\u{1F44D}",
  peak: "\u{1F4C8}",
  manual: "\u{1F4F7}",
};

function triggerLabel(m: Moment): string {
  if (m.trigger === "reaction") return m.emoji ? "Reaction" : "Thumbs up";
  if (m.trigger === "peak") return `Peak: ${m.participantCount}`;
  return "Manual";
}

export function MomentsList({ moments, onDeleteMoment }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (moments.length === 0) {
    return (
      <div className="section">
        <div className="card">
          <div className="section-label">Moments</div>
          <div className="moments-empty">
            <div className="empty-icon">&#128247;</div>
            <div>No moments captured yet</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-label" style={{ padding: "0 4px" }}>Moments ({moments.length})</div>
      <ul className="moments-list">
        {moments.map((m) => (
          <li
            key={m.id}
            className={`moment-item ${m.trigger}${expandedId === m.id ? " expanded" : ""}${m.screenshotPath ? " clickable" : ""}`}
            onClick={m.screenshotPath ? () => setExpandedId(expandedId === m.id ? null : m.id) : undefined}
          >
            <span className={`moment-trigger-icon ${m.trigger}`}>
              {m.emoji || defaultEmoji[m.trigger]}
            </span>
            {m.screenshotPath && (
              <img
                className="moment-thumb"
                src={`/companion-api/image?path=${encodeURIComponent(m.screenshotPath)}`}
                alt="Screenshot"
                onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
              />
            )}
            <div className="moment-details">
              <div className="moment-time">{formatTime(m.timestamp)}</div>
              <div className="moment-label">{triggerLabel(m)}</div>
            </div>
            <span className={`moment-status ${m.captured ? "saved" : "missed"}`}>
              {m.captured ? "Saved" : "Missed"}
            </span>
            {expandedId === m.id && m.screenshotPath && (
              <div className="moment-expanded">
                <img
                  className="moment-expanded-img"
                  src={`/companion-api/image?path=${encodeURIComponent(m.screenshotPath)}`}
                  alt="Screenshot full"
                />
                {onDeleteMoment && (
                  <button
                    className="moment-delete-btn"
                    onClick={(e) => { e.stopPropagation(); onDeleteMoment(m.id); }}
                    type="button"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
