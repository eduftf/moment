import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  emitZoomEvent,
  resetZoomMock,
} from "../test/zoom-sdk-mock";
import { useArchive } from "./useArchive";

function createMockCompanion() {
  return {
    connected: true,
    startArchive: vi.fn(() => true),
    archiveEvent: vi.fn(() => true),
    endArchive: vi.fn(() => true),
  };
}

beforeEach(() => {
  resetZoomMock();
});

describe("useArchive", () => {
  it("starts archive when sdkReady and companion connected", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalledOnce();
    });

    expect(mockCompanion.startArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "start-archive",
        meetingTopic: "Test Meeting",
        meetingId: "123456789",
        meetingUUID: "test-uuid-abc123",
      })
    );
  });

  it("does not start archive when SDK not ready", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: false, companion: mockCompanion })
    );

    // Give time for any async work to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockCompanion.startArchive).not.toHaveBeenCalled();
  });

  it("does not start archive when companion not connected", async () => {
    const mockCompanion = createMockCompanion();
    mockCompanion.connected = false;

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    // Give time for any async work to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockCompanion.startArchive).not.toHaveBeenCalled();
  });

  it("forwards participant join events", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    act(() => {
      emitZoomEvent("onParticipantChange", {
        participants: [
          {
            status: "join",
            screenName: "Alice",
            participantUUID: "uuid-alice",
            role: "host",
          },
        ],
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "archive-event",
        event: expect.objectContaining({
          type: "participant-join",
          name: "Alice",
          uuid: "uuid-alice",
          role: "host",
        }),
      })
    );
  });

  it("forwards participant leave events", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    act(() => {
      emitZoomEvent("onParticipantChange", {
        participants: [
          {
            status: "leave",
            screenName: "Bob",
            participantUUID: "uuid-bob",
          },
        ],
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "archive-event",
        event: expect.objectContaining({
          type: "participant-leave",
          name: "Bob",
          uuid: "uuid-bob",
        }),
      })
    );
  });

  it("forwards reaction events", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    act(() => {
      emitZoomEvent("onEmojiReaction", {
        participantUUID: "uuid-carol",
        emoji: "\u{1F44D}",
        unicode: "U+1F44D",
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "archive-event",
        event: expect.objectContaining({
          type: "reaction",
          uuid: "uuid-carol",
          emoji: "\u{1F44D}",
          unicode: "U+1F44D",
        }),
      })
    );
  });

  it("forwards active speaker changes", async () => {
    const mockCompanion = createMockCompanion();

    renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    act(() => {
      emitZoomEvent("onActiveSpeakerChange", {
        users: [
          { screenName: "Alice", participantUUID: "uuid-alice" },
          { screenName: "Bob", participantUUID: "uuid-bob" },
        ],
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "archive-event",
        event: expect.objectContaining({
          type: "speaker-change",
          speakers: [
            { name: "Alice", uuid: "uuid-alice" },
            { name: "Bob", uuid: "uuid-bob" },
          ],
        }),
      })
    );
  });

  it("ends archive on unmount", async () => {
    const mockCompanion = createMockCompanion();

    const { unmount } = renderHook(() =>
      useArchive({ sdkReady: true, companion: mockCompanion })
    );

    // Wait for archive to start first
    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalledOnce();
    });

    unmount();

    expect(mockCompanion.endArchive).toHaveBeenCalledOnce();
  });
});
