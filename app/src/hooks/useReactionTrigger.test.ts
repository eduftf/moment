import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { emitZoomEvent, resetZoomMock } from "../test/zoom-sdk-mock";
import { useReactionTrigger } from "./useReactionTrigger";

beforeEach(() => {
  resetZoomMock();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReactionTrigger", () => {
  it("triggers on thumbs-up via onReaction event", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D" });

    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("triggers on thumbs-up via onEmojiReaction event", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onEmojiReaction", { reaction: { unicode: "U+1F44D" } });

    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("ignores non-thumbs-up reactions", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+2764" }); // heart
    emitZoomEvent("onReaction", { unicode: "U+1F389" }); // party popper

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("debounces triggers within 5 seconds", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();

    // Second thumbs-up within 5s — should be ignored
    vi.advanceTimersByTime(3000);
    emitZoomEvent("onReaction", { unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();

    // After 5s from first — should trigger again
    vi.advanceTimersByTime(2001);
    emitZoomEvent("onReaction", { unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it("does not trigger when disabled", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: false, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D" });

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("stops listening when disabled after being enabled", () => {
    const onTrigger = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useReactionTrigger({ enabled, onTrigger }),
      { initialProps: { enabled: true } }
    );

    emitZoomEvent("onReaction", { unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();

    rerender({ enabled: false });

    vi.advanceTimersByTime(6000);
    emitZoomEvent("onReaction", { unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce(); // still 1, not 2
  });
});
