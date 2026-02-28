import { describe, it, expect, vi, beforeEach } from "vitest";
import { isAutoStartEnabled, setupAutoStart, removeAutoStart } from "./autostart.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
  platform: vi.fn(() => "darwin"),
}));

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { platform } from "node:os";

describe("autostart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isAutoStartEnabled", () => {
    it("returns true when plist exists on macOS", async () => {
      vi.mocked(platform).mockReturnValue("darwin");
      vi.mocked(readFile).mockResolvedValue("plist content");

      expect(await isAutoStartEnabled()).toBe(true);
    });

    it("returns false when plist does not exist on macOS", async () => {
      vi.mocked(platform).mockReturnValue("darwin");
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

      expect(await isAutoStartEnabled()).toBe(false);
    });

    it("returns false on unsupported platform", async () => {
      vi.mocked(platform).mockReturnValue("linux");

      expect(await isAutoStartEnabled()).toBe(false);
    });
  });

  describe("setupAutoStart", () => {
    it("writes LaunchAgent plist on macOS", async () => {
      vi.mocked(platform).mockReturnValue("darwin");
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await setupAutoStart();

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledOnce();
      const [path, content] = vi.mocked(writeFile).mock.calls[0];
      expect(path).toContain("LaunchAgents");
      expect(path).toContain("space.gtools.moment.companion.plist");
      expect(content).toContain("<key>RunAtLoad</key>");
      expect(content).toContain(process.execPath);
    });

    it("writes VBS script on Windows", async () => {
      vi.mocked(platform).mockReturnValue("win32");
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await setupAutoStart();

      expect(writeFile).toHaveBeenCalledOnce();
      const [path, content] = vi.mocked(writeFile).mock.calls[0];
      expect(path).toContain("Moment Companion.vbs");
      expect(content).toContain("WScript.Shell");
    });
  });

  describe("removeAutoStart", () => {
    it("removes plist on macOS", async () => {
      vi.mocked(platform).mockReturnValue("darwin");
      vi.mocked(unlink).mockResolvedValue(undefined);

      await removeAutoStart();

      expect(unlink).toHaveBeenCalledOnce();
      expect(vi.mocked(unlink).mock.calls[0][0]).toContain("space.gtools.moment.companion.plist");
    });

    it("does not throw if file already removed", async () => {
      vi.mocked(platform).mockReturnValue("darwin");
      vi.mocked(unlink).mockRejectedValue(new Error("ENOENT"));

      await expect(removeAutoStart()).resolves.toBeUndefined();
    });
  });
});
