import { describe, it, expect } from "vitest";
import { sanitize, formatTimestamp } from "./utils.js";

describe("sanitize", () => {
  it("replaces spaces with hyphens", () => {
    expect(sanitize("Team Standup")).toBe("Team-Standup");
  });

  it("removes special characters", () => {
    expect(sanitize("Meeting @10:30 #daily")).toBe("Meeting-1030-daily");
  });

  it("preserves hyphens and underscores", () => {
    expect(sanitize("my-meeting_2024")).toBe("my-meeting_2024");
  });

  it("collapses multiple spaces", () => {
    expect(sanitize("Team   Weekly   Sync")).toBe("Team-Weekly-Sync");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitize("  Meeting  ")).toBe("Meeting");
  });

  it("returns 'meeting' for empty string", () => {
    expect(sanitize("")).toBe("meeting");
  });

  it("returns 'meeting' for string of only special characters", () => {
    expect(sanitize("@#$%^&")).toBe("meeting");
  });

  it("handles unicode characters", () => {
    expect(sanitize("Зустріч команди")).toBe("meeting");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO string to file-safe timestamp", () => {
    // Use a fixed UTC date and account for local timezone
    const date = new Date(2024, 2, 15, 14, 30, 45); // March 15, 2024 14:30:45 local
    const result = formatTimestamp(date.toISOString());
    expect(result).toBe("2024-03-15_14-30-45");
  });

  it("pads single-digit months and times", () => {
    const date = new Date(2024, 0, 5, 9, 3, 7); // Jan 5, 2024 09:03:07 local
    const result = formatTimestamp(date.toISOString());
    expect(result).toBe("2024-01-05_09-03-07");
  });
});
