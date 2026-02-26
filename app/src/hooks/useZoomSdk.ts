import { useState, useEffect } from "react";
import zoomSdk from "@zoom/appssdk";

export type SdkStatus = "loading" | "ready" | "error";

export interface ZoomContext {
  status: SdkStatus;
  error: string | null;
  runningContext: string | null;
  userRole: string | null;
  userName: string | null;
}

const CAPABILITIES = [
  "onReaction",
  "onEmojiReaction",
  "onParticipantChange",
  "onActiveSpeakerChange",
  "onFeedbackReaction",
  "getMeetingParticipants",
  "getMeetingContext",
  "getMeetingUUID",
  "getUserContext",
] as const;

export function useZoomSdk(): ZoomContext {
  const [status, setStatus] = useState<SdkStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [runningContext, setRunningContext] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const configResponse = await zoomSdk.config({
          capabilities: [...CAPABILITIES],
        });

        if (cancelled) return;

        setRunningContext(configResponse.runningContext);

        const unsupported = configResponse.unsupportedApis;
        if (unsupported.length > 0) {
          console.warn("Unsupported APIs:", unsupported);
        }

        // Get user info
        try {
          const user = await zoomSdk.getUserContext();
          if (!cancelled) {
            setUserRole(user.role);
            setUserName(user.screenName);
          }
        } catch {
          // getUserContext may fail outside meetings
        }

        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "SDK init failed");
          setStatus("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { status, error, runningContext, userRole, userName };
}
