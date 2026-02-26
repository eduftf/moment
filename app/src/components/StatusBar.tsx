import type { ParticipantState } from "../hooks/usePeakTrigger";

interface Props {
  sdkReady: boolean;
  companionConnected: boolean;
  participants: ParticipantState;
}

export function StatusBar({ sdkReady, companionConnected, participants }: Props) {
  return (
    <div className="card">
      <div className="status-bar">
        <div className="status-row">
          <span className={`dot ${sdkReady ? "green" : "yellow"}`} />
          <span className="label">{sdkReady ? "Listening" : "Connecting..."}</span>
          <span className="participants-badge">
            {participants.current} <span className="peak">&#x2191;{participants.peak}</span>
          </span>
        </div>
        <div className="status-row">
          <span className={`dot ${companionConnected ? "green" : "gray"}`} />
          <span className="label">
            Companion {companionConnected ? "connected" : "not running"}
          </span>
        </div>
      </div>
    </div>
  );
}
