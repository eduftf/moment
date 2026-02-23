import { useState, useCallback, useRef, useEffect } from "react";
import zoomSdk from "@zoom/appssdk";
import { useZoomSdk } from "./hooks/useZoomSdk";
import { useReactionTrigger } from "./hooks/useReactionTrigger";
import { usePeakTrigger, type ParticipantState } from "./hooks/usePeakTrigger";
import { useCompanion } from "./hooks/useCompanion";
import { StatusBar } from "./components/StatusBar";
import { TriggerSettings } from "./components/TriggerSettings";
import { MomentsList } from "./components/MomentsList";
import { CaptureButton } from "./components/CaptureButton";
import type { Moment, CaptureCommand } from "./types";

export default function App() {
  const sdk = useZoomSdk();
  const companion = useCompanion();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [reactionEnabled, setReactionEnabled] = useState(true);
  const [peakEnabled, setPeakEnabled] = useState(true);
  const meetingTopicRef = useRef("Meeting");
  const idCounter = useRef(0);
  const participantsRef = useRef<ParticipantState>({ current: 1, peak: 1, names: [] });

  // Fetch meeting topic once SDK is ready
  useEffect(() => {
    if (sdk.status !== "ready") return;
    zoomSdk.getMeetingContext().then((ctx: { meetingTopic?: string }) => {
      if (ctx.meetingTopic) meetingTopicRef.current = ctx.meetingTopic;
    }).catch(() => {});
  }, [sdk.status]);

  const addMoment = useCallback(
    (trigger: Moment["trigger"]) => {
      const p = participantsRef.current;
      const now = new Date();
      const command: CaptureCommand = {
        type: "capture",
        trigger,
        timestamp: now.toISOString(),
        participants: p.names,
        participantCount: p.current,
        meetingTopic: meetingTopicRef.current,
      };

      const captured = companion.capture(command);

      const moment: Moment = {
        id: String(++idCounter.current),
        timestamp: now,
        trigger,
        participantCount: p.current,
        participants: p.names,
        meetingTopic: meetingTopicRef.current,
        captured,
      };

      setMoments((prev) => [...prev, moment]);
    },
    [companion]
  );

  const participants = usePeakTrigger({
    enabled: peakEnabled && sdk.status === "ready",
    onTrigger: () => addMoment("peak"),
  });

  // Keep ref in sync
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useReactionTrigger({
    enabled: reactionEnabled && sdk.status === "ready",
    onTrigger: () => addMoment("reaction"),
  });

  const handleManualCapture = useCallback(() => {
    addMoment("manual");
  }, [addMoment]);

  if (sdk.status === "loading") {
    return <div className="app"><p>Connecting to Zoom...</p></div>;
  }

  if (sdk.status === "error") {
    return (
      <div className="app">
        <h1>Moment</h1>
        <p className="error">Not connected to Zoom</p>
        <p className="muted">{sdk.error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Moment</h1>
      <StatusBar
        sdkReady={sdk.status === "ready"}
        companionConnected={companion.connected}
        participants={participants}
      />
      <TriggerSettings
        reactionEnabled={reactionEnabled}
        peakEnabled={peakEnabled}
        onToggleReaction={() => setReactionEnabled((v) => !v)}
        onTogglePeak={() => setPeakEnabled((v) => !v)}
      />
      <MomentsList moments={moments} />
      <CaptureButton onClick={handleManualCapture} />
    </div>
  );
}
