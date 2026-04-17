import { useEffect, useRef, useState, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

interface UsePeakTriggerOptions {
  enabled: boolean;
  onTrigger: (count: number) => void;
}

export interface ParticipantState {
  current: number;
  peak: number;
  names: string[];
}

export function usePeakTrigger({ enabled, onTrigger }: UsePeakTriggerOptions): ParticipantState {
  const [state, setState] = useState<ParticipantState>({ current: 1, peak: 1, names: [] });
  const peakRef = useRef(1);
  const lastTriggerRef = useRef(0);
  const namesRef = useRef(new Map<string, string>()); // uuid -> name
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  // Try to get initial participant list (host/cohost only)
  useEffect(() => {
    async function fetchInitial() {
      try {
        const result = await zoomSdk.getMeetingParticipants();
        const participants = result.participants;
        for (const p of participants) {
          namesRef.current.set(p.participantUUID, p.screenName);
        }
        const count = participants.length;
        peakRef.current = count;
        setState({
          current: count,
          peak: count,
          names: participants.map((p) => p.screenName),
        });
      } catch {
        // Not host/cohost, or not in meeting — that's fine
      }
    }
    fetchInitial();
  }, []);

  const handler = useCallback(
    (event: { participants: Array<{ status: string; screenName: string; participantUUID: string }> }) => {
      for (const p of event.participants) {
        if (p.status === "join") {
          namesRef.current.set(p.participantUUID, p.screenName);
        } else {
          namesRef.current.delete(p.participantUUID);
        }
      }

      const count = namesRef.current.size;
      const names = [...namesRef.current.values()];
      const newPeak = Math.max(peakRef.current, count);
      const isPeakBroken = count > peakRef.current;

      if (isPeakBroken && enabled) {
        const now = Date.now();
        if (now - lastTriggerRef.current >= COOLDOWN_MS) {
          lastTriggerRef.current = now;
          onTriggerRef.current(count);
        }
      }

      peakRef.current = newPeak;
      setState({ current: count, peak: newPeak, names });
    },
    [enabled]
  );

  useEffect(() => {
    try {
      zoomSdk.addEventListener("onParticipantChange", handler);
    } catch {
      // not available
    }
    return () => {
      try { zoomSdk.removeEventListener("onParticipantChange", handler); } catch {}
    };
  }, [handler]);

  return state;
}
