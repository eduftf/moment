interface Props {
  reactionEnabled: boolean;
  peakEnabled: boolean;
  onToggleReaction: () => void;
  onTogglePeak: () => void;
}

export function TriggerSettings({ reactionEnabled, peakEnabled, onToggleReaction, onTogglePeak }: Props) {
  return (
    <div className="section">
      <h3>Triggers</h3>
      <label className="toggle-row">
        <input type="checkbox" checked={reactionEnabled} onChange={onToggleReaction} />
        <span>Thumbs up reaction</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={peakEnabled} onChange={onTogglePeak} />
        <span>Peak participant count</span>
      </label>
    </div>
  );
}
