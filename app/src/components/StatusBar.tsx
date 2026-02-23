import type { ParticipantState } from "../hooks/usePeakTrigger";

interface Props {
  sdkReady: boolean;
  companionConnected: boolean;
  participants: ParticipantState;
}

export function StatusBar({ sdkReady, companionConnected, participants }: Props) {
  return (
    <div className="status-bar">
      <div className="status-row">
        <span className={`dot ${sdkReady ? "green" : "yellow"}`} />
        <span>{sdkReady ? "Listening" : "Connecting..."}</span>
      </div>
      <div className="status-row">
        <span>Participants: {participants.current}</span>
        <span className="muted"> (peak: {participants.peak})</span>
      </div>
      <div className="status-row">
        <span className={`dot ${companionConnected ? "green" : "gray"}`} />
        <span>
          Companion: {companionConnected ? "Connected" : "Not running"}
        </span>
      </div>
    </div>
  );
}
