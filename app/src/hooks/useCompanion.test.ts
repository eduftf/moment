import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompanion } from "./useCompanion";

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCompanion", () => {
  it("connects on mount", () => {
    renderHook(() => useCompanion());

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("reports connected after WebSocket opens", async () => {
    const { result } = renderHook(() => useCompanion());

    expect(result.current.connected).toBe(false);

    // Trigger the async onopen
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.connected).toBe(true);
  });

  it("sends capture command as JSON", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const command = {
      type: "capture" as const,
      trigger: "manual" as const,
      timestamp: "2024-03-15T14:30:45.000Z",
      participants: ["Alice"],
      participantCount: 1,
      meetingTopic: "Test Meeting",
    };

    let captured: boolean;
    act(() => {
      captured = result.current.capture(command);
    });

    expect(captured!).toBe(true);
    expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
      JSON.stringify(command)
    );
  });

  it("returns false when companion not connected", () => {
    const { result } = renderHook(() => useCompanion());

    // Don't trigger onopen — still connecting
    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.CLOSED;

    const captured = result.current.capture({
      type: "capture",
      trigger: "manual",
      timestamp: "2024-03-15T14:30:45.000Z",
      participants: [],
      participantCount: 0,
      meetingTopic: "Test",
    });

    expect(captured).toBe(false);
  });

  it("reconnects after disconnect", async () => {
    renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    // Simulate disconnect
    act(() => {
      MockWebSocket.instances[0].readyState = MockWebSocket.CLOSED;
      MockWebSocket.instances[0].onclose?.();
    });

    // Advance past reconnect delay (5s)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("reports disconnected after close", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockWebSocket.instances[0].readyState = MockWebSocket.CLOSED;
      MockWebSocket.instances[0].onclose?.();
    });

    expect(result.current.connected).toBe(false);
  });

  it("config starts as null", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.config).toBeNull();
  });

  it("sets config when receiving config message", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "config",
          saveDir: "/Users/test/Moment",
          captureMode: "window",
        }),
      });
    });

    expect(result.current.config).toEqual({
      saveDir: "/Users/test/Moment",
      captureMode: "window",
    });
  });

  it("resets config to null on disconnect", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const ws = MockWebSocket.instances[0];

    // First set config via message
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "config",
          saveDir: "/Users/test/Moment",
          captureMode: "screen",
        }),
      });
    });

    expect(result.current.config).not.toBeNull();

    // Simulate disconnect
    act(() => {
      ws.readyState = MockWebSocket.CLOSED;
      ws.onclose?.();
    });

    expect(result.current.config).toBeNull();
  });

  it("updateConfig sends correct message via WebSocket", async () => {
    const { result } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const ws = MockWebSocket.instances[0];

    act(() => {
      result.current.updateConfig({ saveDir: "/new/path" });
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "update-config", saveDir: "/new/path" })
    );
  });

  it("updateConfig does nothing when not connected", () => {
    const { result } = renderHook(() => useCompanion());

    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.CLOSED;

    act(() => {
      result.current.updateConfig({ captureMode: "screen" });
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it("cleans up on unmount", async () => {
    const { unmount } = renderHook(() => useCompanion());

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const ws = MockWebSocket.instances[0];
    unmount();

    expect(ws.close).toHaveBeenCalled();
  });
});
