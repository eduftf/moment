import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { resetZoomMock, zoomSdkMock } from "../test/zoom-sdk-mock";
import { useZoomSdk } from "./useZoomSdk";

beforeEach(() => {
  resetZoomMock();
});

describe("useZoomSdk", () => {
  it("starts in loading state", () => {
    // Make config hang so it stays loading
    zoomSdkMock.config.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useZoomSdk());

    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();
  });

  it("transitions to ready after successful init", async () => {
    const { result } = renderHook(() => useZoomSdk());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.runningContext).toBe("inMeeting");
    expect(result.current.userRole).toBe("host");
    expect(result.current.userName).toBe("Test User");
  });

  it("transitions to error when config fails", async () => {
    zoomSdkMock.config.mockRejectedValue(new Error("SDK not available"));

    const { result } = renderHook(() => useZoomSdk());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("SDK not available");
  });

  it("handles non-Error rejection", async () => {
    zoomSdkMock.config.mockRejectedValue("string error");

    const { result } = renderHook(() => useZoomSdk());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("SDK init failed");
  });

  it("still becomes ready when getUserContext fails", async () => {
    zoomSdkMock.getUserContext.mockRejectedValue(
      new Error("Not in meeting")
    );

    const { result } = renderHook(() => useZoomSdk());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.userRole).toBeNull();
    expect(result.current.userName).toBeNull();
  });

  it("logs unsupported APIs", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    zoomSdkMock.config.mockResolvedValue({
      runningContext: "inMeeting",
      unsupportedApis: ["onEmojiReaction"],
    });

    renderHook(() => useZoomSdk());

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith("Unsupported APIs:", [
        "onEmojiReaction",
      ]);
    });

    warnSpy.mockRestore();
  });

  it("cancels on unmount during init", async () => {
    let resolveConfig: (v: any) => void;
    zoomSdkMock.config.mockReturnValue(
      new Promise((r) => {
        resolveConfig = r;
      })
    );

    const { result, unmount } = renderHook(() => useZoomSdk());
    expect(result.current.status).toBe("loading");

    unmount();

    // Resolve after unmount — state should NOT update
    await act(async () => {
      resolveConfig!({
        runningContext: "inMeeting",
        unsupportedApis: [],
      });
    });

    // Status stays loading since component was unmounted
    expect(result.current.status).toBe("loading");
  });
});
