export interface Moment {
  id: string;
  timestamp: Date;
  trigger: "reaction" | "peak" | "manual";
  participantCount: number;
  participants: string[];
  meetingTopic: string;
  captured: boolean; // true if companion took the screenshot
}

export interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}
