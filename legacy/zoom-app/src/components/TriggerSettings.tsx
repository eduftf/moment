import { ZOOM_REACTIONS } from "../types";

interface Props {
  reactionEnabled: boolean;
  peakEnabled: boolean;
  onToggleReaction: () => void;
  onTogglePeak: () => void;
  allowedReactions?: string[];
  onToggleEmoji?: (unicode: string) => void;
}

export function TriggerSettings({ reactionEnabled, peakEnabled, onToggleReaction, onTogglePeak, allowedReactions, onToggleEmoji }: Props) {
  return (
    <div className="section">
      <div className="card">
        <div className="section-label">Triggers</div>
        <div className="trigger-row">
          <div className="trigger-info">
            <div className="trigger-icon reaction">&#128077;</div>
            <span className="trigger-name">Reaction capture</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={reactionEnabled} onChange={onToggleReaction} />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>
        {reactionEnabled && allowedReactions && onToggleEmoji && (
          <div className="emoji-picker-row">
            {ZOOM_REACTIONS.map(r => (
              <button
                key={r.unicode}
                className={`emoji-btn${allowedReactions.includes(r.unicode) ? " selected" : ""}`}
                onClick={() => onToggleEmoji(r.unicode)}
                aria-label={r.label}
                type="button"
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
        <div className="trigger-row">
          <div className="trigger-info">
            <div className="trigger-icon peak">&#128200;</div>
            <span className="trigger-name">Peak participants</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={peakEnabled} onChange={onTogglePeak} />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>
      </div>
    </div>
  );
}
