import { useEffect, useRef } from "react";
import zoomSdk from "@zoom/appssdk";
import type { StartArchiveCommand, ArchiveEventCommand } from "../types";

interface ArchiveCompanion {
  connected: boolean;
  startArchive: (cmd: StartArchiveCommand) => boolean;
  archiveEvent: (cmd: ArchiveEventCommand) => boolean;
  endArchive: () => boolean;
}

interface UseArchiveOptions {
  sdkReady: boolean;
  companion: ArchiveCompanion;
}

export function useArchive({ sdkReady, companion }: UseArchiveOptions) {
  const startedRef = useRef(false);
  const companionRef = useRef(companion);
  companionRef.current = companion;

  // Start archive when both SDK and companion are ready
  useEffect(() => {
    if (!sdkReady || !companion.connected || startedRef.current) return;

    async function start() {
      try {
        const [ctx, uuid] = await Promise.all([
          zoomSdk.getMeetingContext(),
          zoomSdk.getMeetingUUID().catch(() => ({ meetingUUID: "" })),
        ]);

        if (startedRef.current) return;
        startedRef.current = true;

        const context = ctx as { meetingTopic?: string; meetingID?: string };
        const uuidResult = uuid as { meetingUUID?: string };
        companionRef.current.startArchive({
          type: "start-archive",
          meetingTopic: context.meetingTopic || "Meeting",
          meetingId: context.meetingID || "",
          meetingUUID: uuidResult.meetingUUID || "",
          startTime: new Date().toISOString(),
        });
      } catch {
        // SDK not available
      }
    }

    start();
  }, [sdkReady, companion.connected]);

  // Listen for participant changes and forward to archive
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      participants: Array<{
        status: string;
        screenName: string;
        participantUUID: string;
        role?: string;
      }>;
    }) => {
      for (const p of event.participants) {
        if (p.status === "join") {
          companionRef.current.archiveEvent({
            type: "archive-event",
            event: {
              type: "participant-join",
              timestamp: new Date().toISOString(),
              name: p.screenName,
              uuid: p.participantUUID,
              role: p.role || "attendee",
            },
          });
        } else {
          companionRef.current.archiveEvent({
            type: "archive-event",
            event: {
              type: "participant-leave",
              timestamp: new Date().toISOString(),
              name: p.screenName,
              uuid: p.participantUUID,
            },
          });
        }
      }
    };

    try {
      zoomSdk.addEventListener("onParticipantChange", handler);
    } catch {}
    return () => {
      try {
        zoomSdk.removeEventListener("onParticipantChange", handler);
      } catch {}
    };
  }, [sdkReady]);

  // Listen for emoji reactions and forward to archive
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      participantUUID?: string;
      unicode?: string;
      emoji?: string;
      reaction?: { unicode?: string; emoji?: string };
    }) => {
      companionRef.current.archiveEvent({
        type: "archive-event",
        event: {
          type: "reaction",
          timestamp: new Date().toISOString(),
          name: "",
          uuid: event.participantUUID || "",
          emoji: event.emoji ?? event.reaction?.emoji ?? "",
          unicode: event.unicode ?? event.reaction?.unicode ?? "",
        },
      });
    };

    try {
      zoomSdk.addEventListener("onEmojiReaction", handler);
    } catch {}
    return () => {
      try {
        zoomSdk.removeEventListener("onEmojiReaction", handler);
      } catch {}
    };
  }, [sdkReady]);

  // Listen for active speaker changes
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      users?: Array<{ screenName: string; participantUUID: string }>;
    }) => {
      companionRef.current.archiveEvent({
        type: "archive-event",
        event: {
          type: "speaker-change",
          timestamp: new Date().toISOString(),
          speakers: (event.users || []).map((u) => ({
            name: u.screenName,
            uuid: u.participantUUID,
          })),
        },
      });
    };

    try {
      zoomSdk.addEventListener("onActiveSpeakerChange", handler);
    } catch {}
    return () => {
      try {
        zoomSdk.removeEventListener("onActiveSpeakerChange", handler);
      } catch {}
    };
  }, [sdkReady]);

  // End archive on unmount
  useEffect(() => {
    return () => {
      if (startedRef.current) {
        companionRef.current.endArchive();
      }
    };
  }, []);
}
