import { describe, it, expect, afterEach } from "vitest";
import { usePlatform } from "./usePlatform";

describe("usePlatform", () => {
  const originalNavigator = navigator;

  function mockUserAgent(ua: string, uaData?: any) {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...originalNavigator,
        userAgent: ua,
        userAgentData: uaData,
      },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("detects macOS and defaults to arm64", () => {
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    const result = usePlatform();
    expect(result.os).toBe("macos");
    expect(result.arch).toBe("arm64");
    expect(result.filename).toBe("moment-companion-macos-arm64");
    expect(result.downloadUrl).toContain("moment-companion-macos-arm64");
  });

  it("detects Windows", () => {
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const result = usePlatform();
    expect(result.os).toBe("windows");
    expect(result.arch).toBe("x64");
    expect(result.filename).toBe("moment-companion-win-x64.exe");
  });

  it("uses userAgentData.architecture when available", () => {
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", {
      architecture: "x86",
    });
    const result = usePlatform();
    expect(result.os).toBe("macos");
    expect(result.arch).toBe("x64");
    expect(result.filename).toBe("moment-companion-macos-x64");
  });

  it("detects arm64 from userAgentData", () => {
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", {
      architecture: "arm",
    });
    const result = usePlatform();
    expect(result.arch).toBe("arm64");
  });

  it("returns unknown for unrecognized OS", () => {
    mockUserAgent("Mozilla/5.0 (Unknown)");
    const result = usePlatform();
    expect(result.os).toBe("unknown");
  });
});
