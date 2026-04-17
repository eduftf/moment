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
  it("triggers on any reaction by default", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { emoji: "\u2764\uFE0F", unicode: "U+2764" });

    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("\u2764\uFE0F", "U+2764");
  });

  it("triggers via onEmojiReaction event", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onEmojiReaction", { reaction: { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" } });

    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("\uD83D\uDC4D", "U+1F44D");
  });

  it("filters by allowedReactions when set", () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useReactionTrigger({
        enabled: true,
        onTrigger,
        allowedReactions: ["U+1F44D"],
      })
    );

    // Heart should be ignored
    emitZoomEvent("onReaction", { emoji: "\u2764\uFE0F", unicode: "U+2764" });
    expect(onTrigger).not.toHaveBeenCalled();

    // Thumbs-up should trigger
    emitZoomEvent("onReaction", { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("\uD83D\uDC4D", "U+1F44D");
  });

  it("treats empty allowedReactions as allow-all", () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useReactionTrigger({
        enabled: true,
        onTrigger,
        allowedReactions: [],
      })
    );

    emitZoomEvent("onReaction", { emoji: "\uD83C\uDF89", unicode: "U+1F389" });

    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("\uD83C\uDF89", "U+1F389");
  });

  it("falls back to unicode when emoji field is missing", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D" });

    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("U+1F44D", "U+1F44D");
  });

  it("ignores events with no unicode", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", {});

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("debounces triggers within 5 seconds", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("\uD83D\uDC4D", "U+1F44D");

    // Second reaction within 5s -- should be ignored
    vi.advanceTimersByTime(3000);
    emitZoomEvent("onReaction", { emoji: "\u2764\uFE0F", unicode: "U+2764" });
    expect(onTrigger).toHaveBeenCalledOnce();

    // After 5s from first -- should trigger again
    vi.advanceTimersByTime(2001);
    emitZoomEvent("onReaction", { emoji: "\uD83C\uDF89", unicode: "U+1F389" });
    expect(onTrigger).toHaveBeenCalledTimes(2);
    expect(onTrigger).toHaveBeenLastCalledWith("\uD83C\uDF89", "U+1F389");
  });

  it("does not trigger when disabled", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: false, onTrigger }));

    emitZoomEvent("onReaction", { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" });

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("stops listening when disabled after being enabled", () => {
    const onTrigger = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useReactionTrigger({ enabled, onTrigger }),
      { initialProps: { enabled: true } }
    );

    emitZoomEvent("onReaction", { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce();

    rerender({ enabled: false });

    vi.advanceTimersByTime(6000);
    emitZoomEvent("onReaction", { emoji: "\uD83D\uDC4D", unicode: "U+1F44D" });
    expect(onTrigger).toHaveBeenCalledOnce(); // still 1, not 2
  });
});
