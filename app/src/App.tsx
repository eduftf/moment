import { useState, useCallback, useRef, useEffect } from "react";
import zoomSdk from "@zoom/appssdk";
import { useZoomSdk } from "./hooks/useZoomSdk";
import { useReactionTrigger } from "./hooks/useReactionTrigger";
import { usePeakTrigger, type ParticipantState } from "./hooks/usePeakTrigger";
import { useCompanion } from "./hooks/useCompanion";
import { useArchive } from "./hooks/useArchive";
import { StatusBar } from "./components/StatusBar";
import { TriggerSettings } from "./components/TriggerSettings";
import { MomentsList } from "./components/MomentsList";
import { CaptureButton } from "./components/CaptureButton";
import { Settings } from "./components/Settings";
import { ZOOM_REACTIONS } from "./types";
import type { Moment, CaptureCommand } from "./types";

export default function App() {
  const sdk = useZoomSdk();
  const companion = useCompanion();
  useArchive({
    sdkReady: sdk.status === "ready",
    companion,
  });
  const [moments, setMoments] = useState<Moment[]>([]);
  const [reactionEnabled, setReactionEnabled] = useState(true);
  const [peakEnabled, setPeakEnabled] = useState(true);
  const [allowedReactions, setAllowedReactions] = useState<string[]>(
    ZOOM_REACTIONS.map(r => r.unicode)
  );
  const meetingTopicRef = useRef("Meeting");
  const idCounter = useRef(0);
  const participantsRef = useRef<ParticipantState>({ current: 1, peak: 1, names: [] });
  const syncedFromRemote = useRef(false);

  const toggleReaction = useCallback((unicode: string) => {
    setAllowedReactions(prev =>
      prev.includes(unicode)
        ? prev.filter(u => u !== unicode)
        : [...prev, unicode]
    );
  }, []);

  // Fetch meeting topic once SDK is ready
  useEffect(() => {
    if (sdk.status !== "ready") return;
    zoomSdk.getMeetingContext().then((ctx: { meetingTopic?: string }) => {
      if (ctx.meetingTopic) meetingTopicRef.current = ctx.meetingTopic;
    }).catch(() => {});
  }, [sdk.status]);

  const addMoment = useCallback(
    (trigger: Moment["trigger"], emoji?: string) => {
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
        emoji,
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
    onTrigger: (emoji: string, _unicode: string) => addMoment("reaction", emoji),
    allowedReactions,
  });

  const handleManualCapture = useCallback(() => {
    addMoment("manual");
  }, [addMoment]);

  // Sync allowedReactions to companion
  useEffect(() => {
    companion.updateConfig({ allowedReactions });
  }, [allowedReactions, companion.updateConfig]);

  // Sync allowedReactions from companion on initial connect
  useEffect(() => {
    if (companion.config?.allowedReactions && !syncedFromRemote.current) {
      syncedFromRemote.current = true;
      setAllowedReactions(companion.config.allowedReactions);
    }
  }, [companion.config?.allowedReactions]);

  // Register onCaptured callback
  useEffect(() => {
    companion.setOnCaptured((timestamp: string, imageUrl: string, path: string) => {
      setMoments(prev => prev.map(m =>
        m.timestamp.toISOString() === timestamp
          ? { ...m, imageUrl, screenshotPath: path }
          : m
      ));
    });
  }, [companion.setOnCaptured]);

  const handleDeleteMoment = useCallback((id: string) => {
    setMoments(prev => {
      const moment = prev.find(m => m.id === id);
      if (moment?.screenshotPath) {
        companion.deleteScreenshot(moment.screenshotPath);
      }
      return prev.filter(m => m.id !== id);
    });
  }, [companion]);

  if (sdk.status === "loading") {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="spinner" />
          <span>Connecting to Zoom...</span>
        </div>
      </div>
    );
  }

  if (sdk.status === "error") {
    return (
      <div className="app app-error">
        <div className="error-icon">&#9888;</div>
        <h1>Moment</h1>
        <p className="error">Not connected to Zoom</p>
        <p className="muted">{sdk.error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="app-logo">M</div>
        <h1 className="app-title">Moment</h1>
      </div>
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
        allowedReactions={allowedReactions}
        onToggleEmoji={toggleReaction}
      />
      <CaptureButton onClick={handleManualCapture} ready={companion.connected} />
      <MomentsList moments={moments} onDeleteMoment={handleDeleteMoment} />
      {companion.config && (
        <Settings config={companion.config} onUpdate={companion.updateConfig} />
      )}
    </div>
  );
}
