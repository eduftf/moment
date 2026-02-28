export type ArchiveEvent =
  | { type: "participant-join"; timestamp: string; name: string; uuid: string; role: string }
  | { type: "participant-leave"; timestamp: string; name: string; uuid: string }
  | { type: "reaction"; timestamp: string; name: string; uuid: string; emoji: string; unicode: string }
  | { type: "feedback"; timestamp: string; name: string; uuid: string; feedback: string }
  | { type: "speaker-change"; timestamp: string; speakers: Array<{ name: string; uuid: string }> }
  | { type: "screenshot"; timestamp: string; trigger: string; filename: string; participantCount: number };

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
    trigger: string;
    participantCount: number;
  }>;
}
