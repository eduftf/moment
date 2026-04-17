import { vi } from "vitest";

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Listener>>();

export const zoomSdkMock = {
  config: vi.fn().mockResolvedValue({
    runningContext: "inMeeting",
    unsupportedApis: [],
  }),
  getUserContext: vi.fn().mockResolvedValue({
    role: "host",
    screenName: "Test User",
  }),
  getMeetingParticipants: vi.fn().mockResolvedValue({
    participants: [],
  }),
  getMeetingContext: vi.fn().mockResolvedValue({
    meetingTopic: "Test Meeting",
    meetingID: "123456789",
  }),
  getMeetingUUID: vi.fn().mockResolvedValue({
    meetingUUID: "test-uuid-abc123",
  }),
  openUrl: vi.fn().mockResolvedValue({ message: "success" }),
  addEventListener: vi.fn((event: string, handler: Listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
  }),
  removeEventListener: vi.fn((event: string, handler: Listener) => {
    listeners.get(event)?.delete(handler);
  }),
};

/** Emit a fake Zoom SDK event to all registered listeners */
export function emitZoomEvent(event: string, data: unknown) {
  listeners.get(event)?.forEach((fn) => fn(data));
}

/** Clear all listeners and reset mocks */
export function resetZoomMock() {
  listeners.clear();
  Object.values(zoomSdkMock).forEach((fn) => fn.mockClear());
  zoomSdkMock.config.mockResolvedValue({
    runningContext: "inMeeting",
    unsupportedApis: [],
  });
  zoomSdkMock.getUserContext.mockResolvedValue({
    role: "host",
    screenName: "Test User",
  });
  zoomSdkMock.getMeetingParticipants.mockResolvedValue({
    participants: [],
  });
  zoomSdkMock.getMeetingContext.mockResolvedValue({
    meetingTopic: "Test Meeting",
    meetingID: "123456789",
  });
  zoomSdkMock.getMeetingUUID.mockResolvedValue({
    meetingUUID: "test-uuid-abc123",
  });
}

vi.mock("@zoom/appssdk", () => ({ default: zoomSdkMock }));
