export interface Moment {
  id: string;
  timestamp: Date;
  trigger: "reaction" | "peak" | "manual";
  participantCount: number;
  participants: string[];
  meetingTopic: string;
  captured: boolean; // true if companion took the screenshot
  emoji?: string;
}

export interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}

// --- Archive Types ---

export interface ParticipantJoinEvent {
  type: "participant-join";
  timestamp: string;
  name: string;
  uuid: string;
  role: string;
}

export interface ParticipantLeaveEvent {
  type: "participant-leave";
  timestamp: string;
  name: string;
  uuid: string;
}

export interface ReactionEvent {
  type: "reaction";
  timestamp: string;
  name: string;
  uuid: string;
  emoji: string;
  unicode: string;
}

export interface FeedbackEvent {
  type: "feedback";
  timestamp: string;
  name: string;
  uuid: string;
  feedback: string;
}

export interface SpeakerChangeEvent {
  type: "speaker-change";
  timestamp: string;
  speakers: Array<{ name: string; uuid: string }>;
}

export interface ScreenshotEvent {
  type: "screenshot";
  timestamp: string;
  trigger: "reaction" | "peak" | "manual";
  filename: string;
  participantCount: number;
}

export type ArchiveEvent =
  | ParticipantJoinEvent
  | ParticipantLeaveEvent
  | ReactionEvent
  | FeedbackEvent
  | SpeakerChangeEvent
  | ScreenshotEvent;

export interface ArchiveData {
  meeting: {
    topic: string;
    id: string;
    uuid: string;
    startTime: string;
    endTime: string | null;
  };
  events: ArchiveEvent[];
  screenshots: Array<{
    filename: string;
    timestamp: string;
    trigger: "reaction" | "peak" | "manual";
    participantCount: number;
  }>;
}

export interface StartArchiveCommand {
  type: "start-archive";
  meetingTopic: string;
  meetingId: string;
  meetingUUID: string;
  startTime: string;
}

export interface ArchiveEventCommand {
  type: "archive-event";
  event: ArchiveEvent;
}

export interface EndArchiveCommand {
  type: "end-archive";
}
