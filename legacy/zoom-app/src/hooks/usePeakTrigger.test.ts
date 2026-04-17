import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  emitZoomEvent,
  resetZoomMock,
  zoomSdkMock,
} from "../test/zoom-sdk-mock";
import { usePeakTrigger } from "./usePeakTrigger";

beforeEach(() => {
  resetZoomMock();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function emitJoin(uuid: string, name: string) {
  emitZoomEvent("onParticipantChange", {
    participants: [{ status: "join", participantUUID: uuid, screenName: name }],
  });
}

function emitLeave(uuid: string, name: string) {
  emitZoomEvent("onParticipantChange", {
    participants: [
      { status: "leave", participantUUID: uuid, screenName: name },
    ],
  });
}

describe("usePeakTrigger", () => {
  it("starts with default state (1 participant)", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      usePeakTrigger({ enabled: true, onTrigger })
    );

    expect(result.current).toEqual({
      current: 1,
      peak: 1,
      names: [],
    });
  });

  it("tracks participant joins", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      usePeakTrigger({ enabled: true, onTrigger })
    );

    act(() => emitJoin("u1", "Alice"));

    expect(result.current.current).toBe(1);
    expect(result.current.names).toEqual(["Alice"]);
  });

  it("tracks participant leaves", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      usePeakTrigger({ enabled: true, onTrigger })
    );

    act(() => {
      emitJoin("u1", "Alice");
      emitJoin("u2", "Bob");
    });
    expect(result.current.current).toBe(2);

    act(() => emitLeave("u1", "Alice"));
    expect(result.current.current).toBe(1);
    expect(result.current.names).toEqual(["Bob"]);
  });

  it("triggers when peak is broken", () => {
    const onTrigger = vi.fn();
    renderHook(() => usePeakTrigger({ enabled: true, onTrigger }));

    act(() => emitJoin("u1", "Alice"));
    // peak was 1 (default), now 1 participant in map — not a new peak
    // Let's add more to break the peak
    act(() => emitJoin("u2", "Bob"));

    expect(onTrigger).toHaveBeenCalledWith(2);
  });

  it("respects 2-minute cooldown between triggers", () => {
    const onTrigger = vi.fn();
    renderHook(() => usePeakTrigger({ enabled: true, onTrigger }));

    // First peak break
    act(() => emitJoin("u1", "Alice"));
    act(() => emitJoin("u2", "Bob"));
    expect(onTrigger).toHaveBeenCalledOnce();

    // Someone leaves and rejoins — new peak should be suppressed by cooldown
    act(() => emitLeave("u2", "Bob"));
    act(() => {
      emitJoin("u2", "Bob");
      emitJoin("u3", "Charlie");
    });
    expect(onTrigger).toHaveBeenCalledOnce(); // still 1

    // After 2 minutes — should trigger again
    vi.advanceTimersByTime(2 * 60 * 1000);
    act(() => emitJoin("u4", "Diana"));
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it("does not trigger when disabled", () => {
    const onTrigger = vi.fn();
    renderHook(() => usePeakTrigger({ enabled: false, onTrigger }));

    act(() => emitJoin("u1", "Alice"));
    act(() => emitJoin("u2", "Bob"));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("updates peak even when disabled", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      usePeakTrigger({ enabled: false, onTrigger })
    );

    act(() => emitJoin("u1", "Alice"));
    act(() => emitJoin("u2", "Bob"));

    expect(result.current.peak).toBe(2);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("loads initial participants from SDK", async () => {
    zoomSdkMock.getMeetingParticipants.mockResolvedValue({
      participants: [
        { participantUUID: "u1", screenName: "Alice" },
        { participantUUID: "u2", screenName: "Bob" },
        { participantUUID: "u3", screenName: "Charlie" },
      ],
    });

    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      usePeakTrigger({ enabled: true, onTrigger })
    );

    // Wait for async fetchInitial
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.current).toBe(3);
    expect(result.current.peak).toBe(3);
    expect(result.current.names).toEqual(["Alice", "Bob", "Charlie"]);
  });
});
