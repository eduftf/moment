import { describe, it, expect } from "vitest";
import { buildArchiveHtml } from "./archive-template.js";
import type { ArchiveData } from "./types.js";

function makeArchive(overrides: Partial<ArchiveData> = {}): ArchiveData {
  return {
    meeting: {
      topic: "Team Standup",
      id: "123",
      uuid: "uuid-abc",
      startTime: "2024-03-15T10:00:00.000Z",
      endTime: "2024-03-15T11:00:00.000Z",
      ...overrides.meeting,
    },
    events: overrides.events ?? [],
    screenshots: overrides.screenshots ?? [],
  };
}

describe("buildArchiveHtml", () => {
  it("returns valid HTML document", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Team Standup - Moment Archive</title>");
  });

  it("escapes HTML in meeting topic", () => {
    const html = buildArchiveHtml(
      makeArchive({ meeting: { topic: '<script>alert("xss")</script>', id: "", uuid: "", startTime: "2024-03-15T10:00:00.000Z", endTime: null } })
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows 'In progress' when endTime is null", () => {
    const html = buildArchiveHtml(
      makeArchive({ meeting: { topic: "Test", id: "", uuid: "", startTime: "2024-03-15T10:00:00.000Z", endTime: null } })
    );
    expect(html).toContain("In progress");
  });

  it("formats duration in minutes", () => {
    const html = buildArchiveHtml(
      makeArchive({
        meeting: {
          topic: "Test",
          id: "",
          uuid: "",
          startTime: "2024-03-15T10:00:00.000Z",
          endTime: "2024-03-15T10:45:00.000Z",
        },
      })
    );
    expect(html).toContain("45m");
  });

  it("formats duration in hours and minutes", () => {
    const html = buildArchiveHtml(
      makeArchive({
        meeting: {
          topic: "Test",
          id: "",
          uuid: "",
          startTime: "2024-03-15T10:00:00.000Z",
          endTime: "2024-03-15T12:30:00.000Z",
        },
      })
    );
    expect(html).toContain("2h 30m");
  });

  it("counts unique participants from events", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: "Alice", uuid: "a", role: "host" },
          { type: "participant-join", timestamp: "2024-03-15T10:01:00Z", name: "Bob", uuid: "b", role: "attendee" },
          { type: "participant-join", timestamp: "2024-03-15T10:02:00Z", name: "Alice", uuid: "a", role: "host" },
        ],
      })
    );
    expect(html).toContain("2 participants");
  });

  it("shows singular 'participant' for one person", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: "Alice", uuid: "a", role: "host" },
        ],
      })
    );
    expect(html).toContain("1 participant");
    expect(html).not.toContain("1 participants");
  });

  it("shows empty state when no participants", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("No participant data recorded");
  });

  it("renders participant table with join/leave", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: "Alice", uuid: "a", role: "host" },
          { type: "participant-leave", timestamp: "2024-03-15T10:30:00Z", name: "Alice", uuid: "a" },
        ],
      })
    );
    expect(html).toContain("participants-table");
    expect(html).toContain("Alice");
    expect(html).toContain("host");
  });

  it("shows 'Present' badge for participants who haven't left", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: "Alice", uuid: "a", role: "attendee" },
        ],
      })
    );
    expect(html).toContain("present-badge");
    expect(html).toContain("Present");
  });

  it("renders timeline with different event types", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: "Alice", uuid: "a", role: "host" },
          { type: "reaction", timestamp: "2024-03-15T10:05:00Z", name: "Bob", uuid: "b", emoji: "thumbsup", unicode: "1F44D" },
          { type: "speaker-change", timestamp: "2024-03-15T10:10:00Z", speakers: [{ name: "Alice", uuid: "a" }] },
          { type: "screenshot", timestamp: "2024-03-15T10:15:00Z", trigger: "reaction", filename: "shot.png", participantCount: 3 },
          { type: "participant-leave", timestamp: "2024-03-15T10:30:00Z", name: "Alice", uuid: "a" },
        ],
      })
    );
    expect(html).toContain("joined");
    expect(html).toContain("reacted");
    expect(html).toContain("speaking");
    expect(html).toContain("Screenshot captured");
    expect(html).toContain("left");
  });

  it("shows empty state when no events", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("No events recorded");
  });

  it("renders screenshot gallery", () => {
    const html = buildArchiveHtml(
      makeArchive({
        screenshots: [
          { filename: "shot1.png", timestamp: "2024-03-15T10:05:00Z", trigger: "reaction", participantCount: 5 },
          { filename: "shot2.png", timestamp: "2024-03-15T10:10:00Z", trigger: "manual", participantCount: 3 },
        ],
      })
    );
    expect(html).toContain("gallery-grid");
    expect(html).toContain("images/shot1.png");
    expect(html).toContain("images/shot2.png");
    expect(html).toContain("5 participants");
    expect(html).toContain("3 participants");
    expect(html).toContain("2 screenshots");
  });

  it("shows singular 'screenshot' for one image", () => {
    const html = buildArchiveHtml(
      makeArchive({
        screenshots: [
          { filename: "shot.png", timestamp: "2024-03-15T10:05:00Z", trigger: "peak", participantCount: 2 },
        ],
      })
    );
    expect(html).toContain("1 screenshot");
    expect(html).not.toContain("1 screenshots");
  });

  it("shows empty gallery state when no screenshots", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("No screenshots captured");
  });

  it("includes lightbox script with screenshot data", () => {
    const html = buildArchiveHtml(
      makeArchive({
        screenshots: [
          { filename: "test.png", timestamp: "2024-03-15T10:00:00Z", trigger: "manual", participantCount: 1 },
        ],
      })
    );
    expect(html).toContain("openLightbox");
    expect(html).toContain("closeLightbox");
    expect(html).toContain("navLightbox");
    expect(html).toContain('"filename":"test.png"');
  });

  it("escapes HTML in participant names", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "participant-join", timestamp: "2024-03-15T10:00:00Z", name: '<img src=x onerror=alert(1)>', uuid: "x", role: "attendee" },
        ],
      })
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("handles reaction without name", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "reaction", timestamp: "2024-03-15T10:00:00Z", name: "", uuid: "a", emoji: "heart", unicode: "2764" },
        ],
      })
    );
    expect(html).toContain("Reaction");
    expect(html).toContain("heart");
  });

  it("handles speaker-change with multiple speakers", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          {
            type: "speaker-change",
            timestamp: "2024-03-15T10:00:00Z",
            speakers: [
              { name: "Alice", uuid: "a" },
              { name: "Bob", uuid: "b" },
            ],
          },
        ],
      })
    );
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("speaking");
  });

  it("handles speaker-change with empty speakers list", () => {
    const html = buildArchiveHtml(
      makeArchive({
        events: [
          { type: "speaker-change", timestamp: "2024-03-15T10:00:00Z", speakers: [] },
        ],
      })
    );
    expect(html).toContain("Speaker changed");
  });

  it("applies correct trigger colors", () => {
    const html = buildArchiveHtml(
      makeArchive({
        screenshots: [
          { filename: "r.png", timestamp: "2024-03-15T10:00:00Z", trigger: "reaction", participantCount: 1 },
          { filename: "p.png", timestamp: "2024-03-15T10:01:00Z", trigger: "peak", participantCount: 1 },
          { filename: "m.png", timestamp: "2024-03-15T10:02:00Z", trigger: "manual", participantCount: 1 },
        ],
      })
    );
    expect(html).toContain("#f59e0b"); // reaction amber
    expect(html).toContain("#06b6d4"); // peak cyan
    expect(html).toContain("#8b5cf6"); // manual purple
  });

  it("includes responsive styles", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("@media (max-width: 640px)");
  });

  it("includes light mode support", () => {
    const html = buildArchiveHtml(makeArchive());
    expect(html).toContain("prefers-color-scheme: light");
  });
});
