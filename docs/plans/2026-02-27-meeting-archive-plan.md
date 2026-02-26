# Meeting Archive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Moment from a screenshot tool into a Meeting Archive that captures all meeting data (participants, reactions, active speaker, screenshots) into a beautiful self-contained HTML archive per meeting.

**Architecture:** The app collects SDK events (reactions, participants, speaker changes) and forwards them to the companion via WebSocket. The companion maintains an `archive.json` and regenerates an `archive.html` in real-time. Screenshots are saved into an `images/` subfolder within the archive directory.

**Tech Stack:** React 18 + Vite + TypeScript (app), Node.js + WebSocket (companion), Zoom Apps SDK, Vitest + React Testing Library

---

## Task 1: Add Archive Types

New types for archive events, archive data, and expanded reaction info.

**Files:**
- Modify: `app/src/types.ts`
- Test: Existing tests must still pass

**Step 1: Add new types to types.ts**

Add after existing interfaces in `app/src/types.ts`:

```typescript
export type ArchiveEvent =
  | { type: "participant-join"; timestamp: string; name: string; uuid: string; role: string }
  | { type: "participant-leave"; timestamp: string; name: string; uuid: string }
  | { type: "reaction"; timestamp: string; name: string; uuid: string; emoji: string; unicode: string }
  | { type: "feedback"; timestamp: string; name: string; uuid: string; feedback: string }
  | { type: "speaker-change"; timestamp: string; speakers: Array<{ name: string; uuid: string }> }
  | { type: "screenshot"; timestamp: string; trigger: string; filename: string; participantCount: number };

export interface ArchiveData {
  meeting: {
    topic: string;
    id: string;
    uuid: string;
    startTime: string;
    endTime: string | null;
  };
  events: ArchiveEvent[];
  screenshots: Array<{
    filename: string;
    timestamp: string;
    trigger: string;
    participantCount: number;
  }>;
}

export interface StartArchiveCommand {
  type: "start-archive";
  meetingTopic: string;
  meetingId: string;
  meetingUUID: string;
  startTime: string;
}

export interface ArchiveEventCommand {
  type: "archive-event";
  event: ArchiveEvent;
}

export interface EndArchiveCommand {
  type: "end-archive";
}
```

Also update `Moment` to include emoji info for reaction triggers:

```typescript
export interface Moment {
  id: string;
  timestamp: Date;
  trigger: "reaction" | "peak" | "manual";
  participantCount: number;
  participants: string[];
  meetingTopic: string;
  captured: boolean;
  emoji?: string;  // emoji character for reaction triggers (e.g., "👍")
}
```

**Step 2: Run tests to verify nothing broke**

Run: `npm run test:run --workspace=app`
Expected: All existing tests pass (Moment is used in tests with spread objects, the optional `emoji` field won't break them)

**Step 3: Commit**

```bash
git add app/src/types.ts
git commit -m "feat: add archive types and emoji field to Moment"
```

---

## Task 2: Expand Reaction Trigger to All Emojis

Change from thumbs-up-only to configurable reaction list. Default: all reactions trigger.

**Files:**
- Modify: `app/src/hooks/useReactionTrigger.ts`
- Modify: `app/src/hooks/useReactionTrigger.test.ts`

**Step 1: Update useReactionTrigger.ts**

Replace the full file content:

```typescript
import { useEffect, useRef, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const DEBOUNCE_MS = 5000;

interface UseReactionTriggerOptions {
  enabled: boolean;
  onTrigger: (emoji: string, unicode: string) => void;
  /** If set, only these unicode values trigger. If empty/undefined, all reactions trigger. */
  allowedReactions?: string[];
}

export function useReactionTrigger({ enabled, onTrigger, allowedReactions }: UseReactionTriggerOptions) {
  const lastTriggerRef = useRef<number>(0);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  const allowedRef = useRef(allowedReactions);
  allowedRef.current = allowedReactions;

  const handler = useCallback((event: {
    unicode?: string;
    emoji?: string;
    reaction?: { unicode?: string; emoji?: string };
  }) => {
    const unicode = event.unicode ?? event.reaction?.unicode;
    const emoji = event.emoji ?? event.reaction?.emoji ?? "";
    if (!unicode) return;

    // If allowedReactions is set and non-empty, filter
    if (allowedRef.current && allowedRef.current.length > 0) {
      if (!allowedRef.current.includes(unicode)) return;
    }

    const now = Date.now();
    if (now - lastTriggerRef.current < DEBOUNCE_MS) return;

    lastTriggerRef.current = now;
    onTriggerRef.current(emoji, unicode);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    try {
      zoomSdk.addEventListener("onEmojiReaction", handler);
    } catch {
      // fallback
    }
    try {
      zoomSdk.addEventListener("onReaction", handler);
    } catch {
      // fallback
    }

    return () => {
      try { zoomSdk.removeEventListener("onEmojiReaction", handler); } catch {}
      try { zoomSdk.removeEventListener("onReaction", handler); } catch {}
    };
  }, [enabled, handler]);
}
```

**Step 2: Update tests**

Replace `app/src/hooks/useReactionTrigger.test.ts`:

```typescript
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

    emitZoomEvent("onReaction", { unicode: "U+2764", emoji: "\u2764" });

    expect(onTrigger).toHaveBeenCalledWith("\u2764", "U+2764");
  });

  it("triggers via onEmojiReaction event", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onEmojiReaction", { reaction: { unicode: "U+1F44D", emoji: "\u{1F44D}" } });

    expect(onTrigger).toHaveBeenCalledWith("\u{1F44D}", "U+1F44D");
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

    emitZoomEvent("onReaction", { unicode: "U+2764", emoji: "\u2764" });
    expect(onTrigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5001);
    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("debounces triggers within 5 seconds", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: true, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(3000);
    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(2001);
    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it("does not trigger when disabled", () => {
    const onTrigger = vi.fn();
    renderHook(() => useReactionTrigger({ enabled: false, onTrigger }));

    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("stops listening when disabled after being enabled", () => {
    const onTrigger = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useReactionTrigger({ enabled, onTrigger }),
      { initialProps: { enabled: true } }
    );

    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledOnce();

    rerender({ enabled: false });

    vi.advanceTimersByTime(6000);
    emitZoomEvent("onReaction", { unicode: "U+1F44D", emoji: "\u{1F44D}" });
    expect(onTrigger).toHaveBeenCalledOnce();
  });
});
```

**Step 3: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 4: Commit**

```bash
git add app/src/hooks/useReactionTrigger.ts app/src/hooks/useReactionTrigger.test.ts
git commit -m "feat: expand reaction trigger to all emojis with configurable filter"
```

---

## Task 3: Register New SDK Capabilities

Add `onActiveSpeakerChange`, `onFeedbackReaction`, and `getMeetingUUID` to the SDK config.

**Files:**
- Modify: `app/src/hooks/useZoomSdk.ts` (lines 14-21, the CAPABILITIES array)
- Modify: `app/src/test/zoom-sdk-mock.ts` (add new mock methods)

**Step 1: Update CAPABILITIES in useZoomSdk.ts**

Change the CAPABILITIES array (lines 14-21):

```typescript
const CAPABILITIES = [
  "onReaction",
  "onEmojiReaction",
  "onParticipantChange",
  "onActiveSpeakerChange",
  "onFeedbackReaction",
  "getMeetingParticipants",
  "getMeetingContext",
  "getMeetingUUID",
  "getUserContext",
] as const;
```

**Step 2: Update zoom-sdk-mock.ts**

Add new mock methods to `zoomSdkMock`:

```typescript
getMeetingContext: vi.fn().mockResolvedValue({
  meetingTopic: "Test Meeting",
  meetingID: "123456789",
}),
getMeetingUUID: vi.fn().mockResolvedValue({
  meetingUUID: "test-uuid-abc123",
}),
```

Also add these to `resetZoomMock()`:

```typescript
zoomSdkMock.getMeetingContext.mockResolvedValue({
  meetingTopic: "Test Meeting",
  meetingID: "123456789",
});
zoomSdkMock.getMeetingUUID.mockResolvedValue({
  meetingUUID: "test-uuid-abc123",
});
```

**Step 3: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 4: Commit**

```bash
git add app/src/hooks/useZoomSdk.ts app/src/test/zoom-sdk-mock.ts
git commit -m "feat: register new SDK capabilities for archive events"
```

---

## Task 4: Update useCompanion with Archive Messages

Add methods to send archive lifecycle messages over WebSocket.

**Files:**
- Modify: `app/src/hooks/useCompanion.ts`
- Modify: `app/src/hooks/useCompanion.test.ts`

**Step 1: Update useCompanion.ts**

Add new imports and types. Add `archivePath` state and new methods:

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import type { CaptureCommand, StartArchiveCommand, ArchiveEventCommand, EndArchiveCommand } from "../types";

export interface CompanionConfig {
  saveDir: string;
  captureMode: "window" | "screen" | "video";
}

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws-companion`;
const RECONNECT_MS = 5000;

export function useCompanion() {
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [archivePath, setArchivePath] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "config") {
            setConfig({ saveDir: msg.saveDir, captureMode: msg.captureMode });
          }
          if (msg.type === "archive-started") {
            setArchivePath(msg.path);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        setConfig(null);
        setArchivePath(null);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: object): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  const capture = useCallback((command: CaptureCommand): boolean => send(command), [send]);

  const startArchive = useCallback((command: StartArchiveCommand): boolean => send(command), [send]);

  const archiveEvent = useCallback((command: ArchiveEventCommand): boolean => send(command), [send]);

  const endArchive = useCallback((): boolean => send({ type: "end-archive" } as EndArchiveCommand), [send]);

  const updateConfig = useCallback((updates: Partial<CompanionConfig>) => {
    send({ type: "update-config", ...updates });
  }, [send]);

  return { connected, config, archivePath, capture, startArchive, archiveEvent, endArchive, updateConfig };
}
```

**Step 2: Add tests for new methods**

Add these tests to `app/src/hooks/useCompanion.test.ts` (append to the existing describe block):

```typescript
it("sets archivePath on archive-started message", async () => {
  const { result } = renderHook(() => useCompanion());
  await act(async () => { getLastSocket().onopen!(new Event("open")); });

  await act(async () => {
    getLastSocket().onmessage!(new MessageEvent("message", {
      data: JSON.stringify({ type: "archive-started", path: "/Users/test/Moment/Meeting-2026-02-27" }),
    }));
  });

  expect(result.current.archivePath).toBe("/Users/test/Moment/Meeting-2026-02-27");
});

it("resets archivePath on disconnect", async () => {
  const { result } = renderHook(() => useCompanion());
  await act(async () => { getLastSocket().onopen!(new Event("open")); });
  await act(async () => {
    getLastSocket().onmessage!(new MessageEvent("message", {
      data: JSON.stringify({ type: "archive-started", path: "/some/path" }),
    }));
  });

  await act(async () => { getLastSocket().onclose!(new CloseEvent("close")); });

  expect(result.current.archivePath).toBeNull();
});

it("sends start-archive command", async () => {
  const { result } = renderHook(() => useCompanion());
  await act(async () => { getLastSocket().onopen!(new Event("open")); });

  const sent = result.current.startArchive({
    type: "start-archive",
    meetingTopic: "Standup",
    meetingId: "123",
    meetingUUID: "uuid-abc",
    startTime: "2026-02-27T10:00:00Z",
  });

  expect(sent).toBe(true);
  const msg = JSON.parse(getLastSocket().sent[getLastSocket().sent.length - 1]);
  expect(msg.type).toBe("start-archive");
  expect(msg.meetingTopic).toBe("Standup");
});

it("sends archive-event command", async () => {
  const { result } = renderHook(() => useCompanion());
  await act(async () => { getLastSocket().onopen!(new Event("open")); });

  result.current.archiveEvent({
    type: "archive-event",
    event: { type: "reaction", timestamp: "2026-02-27T10:05:00Z", name: "Alice", uuid: "u1", emoji: "\u{1F44D}", unicode: "U+1F44D" },
  });

  const msg = JSON.parse(getLastSocket().sent[getLastSocket().sent.length - 1]);
  expect(msg.type).toBe("archive-event");
  expect(msg.event.type).toBe("reaction");
});

it("sends end-archive command", async () => {
  const { result } = renderHook(() => useCompanion());
  await act(async () => { getLastSocket().onopen!(new Event("open")); });

  result.current.endArchive();

  const msg = JSON.parse(getLastSocket().sent[getLastSocket().sent.length - 1]);
  expect(msg.type).toBe("end-archive");
});
```

Note: These tests use the existing `getLastSocket()` helper from the test file. Check the existing test for the exact mock pattern and adapt if needed.

**Step 3: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 4: Commit**

```bash
git add app/src/hooks/useCompanion.ts app/src/hooks/useCompanion.test.ts
git commit -m "feat: add archive lifecycle methods to useCompanion"
```

---

## Task 5: Create useArchive Hook

Orchestrates the archive lifecycle: starts archive on meeting join, collects SDK events, forwards to companion.

**Files:**
- Create: `app/src/hooks/useArchive.ts`
- Create: `app/src/hooks/useArchive.test.ts`

**Step 1: Write the test file**

Create `app/src/hooks/useArchive.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { emitZoomEvent, resetZoomMock, zoomSdkMock } from "../test/zoom-sdk-mock";
import { useArchive } from "./useArchive";

beforeEach(() => {
  resetZoomMock();
});

describe("useArchive", () => {
  const mockCompanion = {
    connected: true,
    startArchive: vi.fn(() => true),
    archiveEvent: vi.fn(() => true),
    endArchive: vi.fn(() => true),
  };

  it("starts archive when sdkReady and companion connected", async () => {
    renderHook(() => useArchive({ sdkReady: true, companion: mockCompanion }));

    // Wait for async init
    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalledOnce();
    });

    const call = mockCompanion.startArchive.mock.calls[0][0];
    expect(call.type).toBe("start-archive");
    expect(call.meetingTopic).toBe("Test Meeting");
  });

  it("does not start archive when SDK not ready", () => {
    renderHook(() => useArchive({ sdkReady: false, companion: mockCompanion }));

    expect(mockCompanion.startArchive).not.toHaveBeenCalled();
  });

  it("does not start archive when companion not connected", () => {
    renderHook(() =>
      useArchive({ sdkReady: true, companion: { ...mockCompanion, connected: false } })
    );

    expect(mockCompanion.startArchive).not.toHaveBeenCalled();
  });

  it("forwards participant join events", async () => {
    renderHook(() => useArchive({ sdkReady: true, companion: mockCompanion }));

    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalled();
    });

    act(() => {
      emitZoomEvent("onParticipantChange", {
        participants: [{ status: "join", screenName: "Alice", participantUUID: "u1", role: "attendee" }],
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalled();
    const event = mockCompanion.archiveEvent.mock.calls[0][0].event;
    expect(event.type).toBe("participant-join");
    expect(event.name).toBe("Alice");
  });

  it("forwards reaction events", async () => {
    renderHook(() => useArchive({ sdkReady: true, companion: mockCompanion }));

    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalled();
    });

    act(() => {
      emitZoomEvent("onEmojiReaction", {
        participantUUID: "u1",
        timestamp: 1234,
        reaction: { unicode: "U+1F44D", emoji: "\u{1F44D}", name: "thumbsup" },
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalled();
    const event = mockCompanion.archiveEvent.mock.calls[0][0].event;
    expect(event.type).toBe("reaction");
    expect(event.emoji).toBe("\u{1F44D}");
  });

  it("forwards active speaker changes", async () => {
    renderHook(() => useArchive({ sdkReady: true, companion: mockCompanion }));

    await vi.waitFor(() => {
      expect(mockCompanion.startArchive).toHaveBeenCalled();
    });

    act(() => {
      emitZoomEvent("onActiveSpeakerChange", {
        timestamp: 1234,
        users: [{ screenName: "Bob", participantUUID: "u2" }],
      });
    });

    expect(mockCompanion.archiveEvent).toHaveBeenCalled();
    const event = mockCompanion.archiveEvent.mock.calls[0][0].event;
    expect(event.type).toBe("speaker-change");
    expect(event.speakers[0].name).toBe("Bob");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:run --workspace=app -- --reporter=verbose 2>&1 | head -30`
Expected: FAIL — module `./useArchive` not found

**Step 3: Implement useArchive.ts**

Create `app/src/hooks/useArchive.ts`:

```typescript
import { useEffect, useRef } from "react";
import zoomSdk from "@zoom/appssdk";
import type { StartArchiveCommand, ArchiveEventCommand } from "../types";

interface ArchiveCompanion {
  connected: boolean;
  startArchive: (cmd: StartArchiveCommand) => boolean;
  archiveEvent: (cmd: ArchiveEventCommand) => boolean;
  endArchive: () => boolean;
}

interface UseArchiveOptions {
  sdkReady: boolean;
  companion: ArchiveCompanion;
}

export function useArchive({ sdkReady, companion }: UseArchiveOptions) {
  const startedRef = useRef(false);
  const companionRef = useRef(companion);
  companionRef.current = companion;

  // Start archive when both SDK and companion are ready
  useEffect(() => {
    if (!sdkReady || !companion.connected || startedRef.current) return;

    async function start() {
      try {
        const [ctx, uuid] = await Promise.all([
          zoomSdk.getMeetingContext(),
          zoomSdk.getMeetingUUID().catch(() => ({ meetingUUID: "" })),
        ]);

        if (startedRef.current) return;
        startedRef.current = true;

        companionRef.current.startArchive({
          type: "start-archive",
          meetingTopic: ctx.meetingTopic || "Meeting",
          meetingId: (ctx as any).meetingID || "",
          meetingUUID: uuid.meetingUUID || "",
          startTime: new Date().toISOString(),
        });
      } catch {
        // SDK not available
      }
    }

    start();
  }, [sdkReady, companion.connected]);

  // Listen for participant changes
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      participants: Array<{ status: string; screenName: string; participantUUID: string; role?: string }>;
    }) => {
      for (const p of event.participants) {
        if (p.status === "join") {
          companionRef.current.archiveEvent({
            type: "archive-event",
            event: {
              type: "participant-join",
              timestamp: new Date().toISOString(),
              name: p.screenName,
              uuid: p.participantUUID,
              role: p.role || "attendee",
            },
          });
        } else {
          companionRef.current.archiveEvent({
            type: "archive-event",
            event: {
              type: "participant-leave",
              timestamp: new Date().toISOString(),
              name: p.screenName,
              uuid: p.participantUUID,
            },
          });
        }
      }
    };

    try { zoomSdk.addEventListener("onParticipantChange", handler); } catch {}
    return () => {
      try { zoomSdk.removeEventListener("onParticipantChange", handler); } catch {}
    };
  }, [sdkReady]);

  // Listen for emoji reactions (for archive log, separate from screenshot trigger)
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      participantUUID?: string;
      timestamp?: number;
      unicode?: string;
      emoji?: string;
      reaction?: { unicode?: string; emoji?: string; name?: string };
    }) => {
      companionRef.current.archiveEvent({
        type: "archive-event",
        event: {
          type: "reaction",
          timestamp: new Date().toISOString(),
          name: "",
          uuid: event.participantUUID || "",
          emoji: event.emoji ?? event.reaction?.emoji ?? "",
          unicode: event.unicode ?? event.reaction?.unicode ?? "",
        },
      });
    };

    try { zoomSdk.addEventListener("onEmojiReaction", handler); } catch {}
    return () => {
      try { zoomSdk.removeEventListener("onEmojiReaction", handler); } catch {}
    };
  }, [sdkReady]);

  // Listen for active speaker changes
  useEffect(() => {
    if (!sdkReady) return;

    const handler = (event: {
      timestamp?: number;
      users?: Array<{ screenName: string; participantUUID: string }>;
    }) => {
      companionRef.current.archiveEvent({
        type: "archive-event",
        event: {
          type: "speaker-change",
          timestamp: new Date().toISOString(),
          speakers: (event.users || []).map((u) => ({
            name: u.screenName,
            uuid: u.participantUUID,
          })),
        },
      });
    };

    try { zoomSdk.addEventListener("onActiveSpeakerChange", handler); } catch {}
    return () => {
      try { zoomSdk.removeEventListener("onActiveSpeakerChange", handler); } catch {}
    };
  }, [sdkReady]);

  // End archive on unmount
  useEffect(() => {
    return () => {
      if (startedRef.current) {
        companionRef.current.endArchive();
      }
    };
  }, []);
}
```

**Step 4: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 5: Commit**

```bash
git add app/src/hooks/useArchive.ts app/src/hooks/useArchive.test.ts
git commit -m "feat: add useArchive hook for meeting event collection"
```

---

## Task 6: Companion — Archive Data Management

Handle archive lifecycle messages, maintain archive.json, add screenshots to archive.

**Files:**
- Modify: `companion/src/index.ts`
- Modify: `companion/src/utils.ts`

**Step 1: Add archive state and types to companion/src/index.ts**

Add after the existing Config interface (around line 25):

```typescript
interface ArchiveData {
  meeting: {
    topic: string;
    id: string;
    uuid: string;
    startTime: string;
    endTime: string | null;
  };
  events: any[];
  screenshots: Array<{
    filename: string;
    timestamp: string;
    trigger: string;
    participantCount: number;
  }>;
}

let activeArchive: { dir: string; data: ArchiveData } | null = null;
```

**Step 2: Add archive helper functions**

Add before the server section (before `await loadConfig()`):

```typescript
async function startArchive(msg: {
  meetingTopic: string;
  meetingId: string;
  meetingUUID: string;
  startTime: string;
}): Promise<string> {
  const date = formatTimestamp(msg.startTime).split("_")[0]; // YYYY-MM-DD
  const dirName = `${sanitize(msg.meetingTopic)}-${date}`;
  const dir = join(config.saveDir, dirName);
  await mkdir(join(dir, "images"), { recursive: true });

  const data: ArchiveData = {
    meeting: {
      topic: msg.meetingTopic,
      id: msg.meetingId,
      uuid: msg.meetingUUID,
      startTime: msg.startTime,
      endTime: null,
    },
    events: [],
    screenshots: [],
  };

  activeArchive = { dir, data };
  await writeArchive();
  console.log(`Archive started: ${dir}`);
  return dir;
}

async function writeArchive(): Promise<void> {
  if (!activeArchive) return;
  const jsonPath = join(activeArchive.dir, "archive.json");
  await writeFile(jsonPath, JSON.stringify(activeArchive.data, null, 2));
  await generateArchiveHtml(activeArchive.dir, activeArchive.data);
}

async function addArchiveEvent(event: any): Promise<void> {
  if (!activeArchive) return;
  activeArchive.data.events.push(event);
  await writeArchive();
}

async function endArchive(): Promise<void> {
  if (!activeArchive) return;
  activeArchive.data.meeting.endTime = new Date().toISOString();
  await writeArchive();
  console.log(`Archive ended: ${activeArchive.dir}`);
  activeArchive = null;
}
```

**Step 3: Update handleCapture to use archive directory when active**

Replace `handleCapture`:

```typescript
async function handleCapture(data: CaptureCommand): Promise<string> {
  let dir: string;
  let baseName: string;

  if (activeArchive) {
    dir = join(activeArchive.dir, "images");
    const ts = formatTimestamp(data.timestamp);
    baseName = `${ts}_${data.trigger}`;
  } else {
    dir = join(config.saveDir, sanitize(data.meetingTopic));
    const ts = formatTimestamp(data.timestamp);
    baseName = `${ts}_${data.trigger}`;
  }

  await mkdir(dir, { recursive: true });

  const pngPath = join(dir, `${baseName}.png`);
  await takeScreenshot(pngPath);

  if (activeArchive) {
    const filename = `${baseName}.png`;
    activeArchive.data.screenshots.push({
      filename,
      timestamp: data.timestamp,
      trigger: data.trigger,
      participantCount: data.participantCount,
    });
    activeArchive.data.events.push({
      type: "screenshot",
      timestamp: data.timestamp,
      trigger: data.trigger,
      filename,
      participantCount: data.participantCount,
    });
    await writeArchive();
  } else {
    // Legacy: save metadata JSON alongside screenshot
    const jsonPath = join(dir, `${baseName}.json`);
    const metadata = {
      timestamp: data.timestamp,
      trigger: data.trigger,
      participants: data.participants,
      participantCount: data.participantCount,
      meetingTopic: data.meetingTopic,
      captureMode: config.captureMode,
    };
    await writeFile(jsonPath, JSON.stringify(metadata, null, 2));
  }

  console.log(`Captured: ${pngPath}`);
  return pngPath;
}
```

**Step 4: Add message handlers for archive messages**

Update the WebSocket message handler (the `ws.on("message")` block). Add these cases:

```typescript
if (msg.type === "start-archive") {
  const path = await startArchive(msg);
  ws.send(JSON.stringify({ type: "archive-started", path }));
}

if (msg.type === "archive-event") {
  await addArchiveEvent(msg.event);
}

if (msg.type === "end-archive") {
  await endArchive();
}
```

**Step 5: Add generateArchiveHtml stub**

Add a placeholder in `companion/src/index.ts` (will be implemented in Task 7):

```typescript
async function generateArchiveHtml(dir: string, data: ArchiveData): Promise<void> {
  const { buildArchiveHtml } = await import("./archive-template.js");
  const html = buildArchiveHtml(data);
  await writeFile(join(dir, "archive.html"), html);
}
```

**Step 6: Build companion**

Run: `npm run build --workspace=companion`
Expected: Build succeeds (after creating the archive-template stub in next task)

**Step 7: Commit**

```bash
git add companion/src/index.ts
git commit -m "feat: companion archive lifecycle and screenshot integration"
```

---

## Task 7: HTML Archive Template

Beautiful self-contained HTML viewer for the meeting archive.

**Files:**
- Create: `companion/src/archive-template.ts`

**Step 1: Create archive-template.ts**

Create `companion/src/archive-template.ts`:

```typescript
interface ArchiveData {
  meeting: {
    topic: string;
    id: string;
    uuid: string;
    startTime: string;
    endTime: string | null;
  };
  events: any[];
  screenshots: Array<{
    filename: string;
    timestamp: string;
    trigger: string;
    participantCount: number;
  }>;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs > 0) return `${hrs}h ${m}m`;
  return `${m}m`;
}

export function buildArchiveHtml(data: ArchiveData): string {
  const { meeting, events, screenshots } = data;

  // Collect unique participants from events
  const participants = new Map<string, { name: string; role?: string; joinTime?: string; leaveTime?: string }>();
  const reactions: any[] = [];
  const speakerChanges: any[] = [];

  for (const e of events) {
    if (e.type === "participant-join") {
      participants.set(e.uuid, { name: e.name, role: e.role, joinTime: e.timestamp });
    }
    if (e.type === "participant-leave") {
      const p = participants.get(e.uuid);
      if (p) p.leaveTime = e.timestamp;
    }
    if (e.type === "reaction") {
      reactions.push(e);
    }
    if (e.type === "speaker-change") {
      speakerChanges.push(e);
    }
  }

  const participantRows = [...participants.values()]
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${p.role || "attendee"}</td>
          <td>${p.joinTime ? formatTime(p.joinTime) : "-"}</td>
          <td>${p.leaveTime ? formatTime(p.leaveTime) : "Present"}</td>
        </tr>`
    )
    .join("\n");

  const timelineHtml = events
    .map((e: any) => {
      const time = formatTime(e.timestamp);
      switch (e.type) {
        case "participant-join":
          return `<div class="event join"><span class="time">${time}</span><span class="icon">&#x2795;</span> <strong>${escapeHtml(e.name)}</strong> joined</div>`;
        case "participant-leave":
          return `<div class="event leave"><span class="time">${time}</span><span class="icon">&#x274C;</span> <strong>${escapeHtml(e.name)}</strong> left</div>`;
        case "reaction":
          return `<div class="event reaction"><span class="time">${time}</span><span class="icon">${e.emoji || "&#x1F44D;"}</span> ${e.name ? `<strong>${escapeHtml(e.name)}</strong> reacted` : "Reaction"}</div>`;
        case "feedback":
          return `<div class="event feedback"><span class="time">${time}</span><span class="icon">&#x270B;</span> <strong>${escapeHtml(e.name)}</strong> — ${escapeHtml(e.feedback)}</div>`;
        case "speaker-change":
          const names = (e.speakers || []).map((s: any) => escapeHtml(s.name)).join(", ");
          return `<div class="event speaker"><span class="time">${time}</span><span class="icon">&#x1F3A4;</span> Speaking: <strong>${names}</strong></div>`;
        case "screenshot":
          return `<div class="event screenshot"><span class="time">${time}</span><span class="icon">&#x1F4F7;</span> Screenshot captured (${escapeHtml(e.trigger)})</div>`;
        default:
          return "";
      }
    })
    .join("\n");

  const galleryHtml = screenshots
    .map(
      (s) =>
        `<div class="screenshot-card">
          <img src="./images/${escapeHtml(s.filename)}" alt="Screenshot at ${formatTime(s.timestamp)}" loading="lazy" />
          <div class="screenshot-meta">
            <span>${formatTime(s.timestamp)}</span>
            <span class="trigger-badge ${s.trigger}">${escapeHtml(s.trigger)}</span>
            <span>${s.participantCount} participants</span>
          </div>
        </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(meeting.topic)} — Moment Archive</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f0f1a;
    --surface: #1a1a2e;
    --surface2: #252540;
    --text: #e8e8f0;
    --text-muted: #8888a0;
    --primary: #6366f1;
    --primary-light: #8b5cf6;
    --accent-reaction: #f59e0b;
    --accent-peak: #06b6d4;
    --accent-manual: #8b5cf6;
    --success: #10b981;
    --border: rgba(255,255,255,0.08);
    --radius: 12px;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f0f0f5;
      --surface: #ffffff;
      --surface2: #f5f5fa;
      --text: #1a1a2e;
      --text-muted: #6b6b80;
      --border: rgba(0,0,0,0.08);
    }
  }

  body {
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

  .header {
    text-align: center;
    margin-bottom: 3rem;
    padding: 2rem;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .header .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, var(--primary), var(--primary-light));
    border-radius: 12px;
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
    margin-bottom: 1rem;
  }

  .header h1 {
    font-size: 1.8rem;
    font-weight: 600;
    background: linear-gradient(135deg, var(--primary), var(--primary-light));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.5rem;
  }

  .header .meta {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .header .meta span { margin: 0 0.75rem; }

  .section {
    margin-bottom: 2rem;
  }

  .section h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  /* Participants table */
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  th, td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  th {
    background: var(--surface2);
    font-weight: 500;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  tr:last-child td { border-bottom: none; }

  /* Timeline */
  .timeline {
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    max-height: 500px;
    overflow-y: auto;
  }

  .event {
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .event:last-child { border-bottom: none; }

  .event .time {
    color: var(--text-muted);
    font-size: 0.8rem;
    min-width: 80px;
    font-variant-numeric: tabular-nums;
  }

  .event .icon { font-size: 1rem; min-width: 24px; text-align: center; }

  .event.join { border-left: 3px solid var(--success); }
  .event.leave { border-left: 3px solid #ef4444; }
  .event.reaction { border-left: 3px solid var(--accent-reaction); }
  .event.speaker { border-left: 3px solid var(--accent-peak); }
  .event.screenshot { border-left: 3px solid var(--accent-manual); }
  .event.feedback { border-left: 3px solid var(--primary); }

  /* Gallery */
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .screenshot-card {
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
    transition: transform 0.2s;
  }

  .screenshot-card:hover { transform: translateY(-2px); }

  .screenshot-card img {
    width: 100%;
    display: block;
    cursor: pointer;
  }

  .screenshot-meta {
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .trigger-badge {
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .trigger-badge.reaction { background: rgba(245,158,11,0.15); color: var(--accent-reaction); }
  .trigger-badge.peak { background: rgba(6,182,212,0.15); color: var(--accent-peak); }
  .trigger-badge.manual { background: rgba(139,92,246,0.15); color: var(--accent-manual); }

  /* Lightbox */
  .lightbox {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    z-index: 100;
    justify-content: center;
    align-items: center;
    cursor: pointer;
  }

  .lightbox.open { display: flex; }
  .lightbox img { max-width: 95%; max-height: 95%; object-fit: contain; border-radius: 8px; }

  .empty { text-align: center; padding: 3rem; color: var(--text-muted); }

  .footer {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">M</div>
    <h1>${escapeHtml(meeting.topic)}</h1>
    <div class="meta">
      <span>${formatDate(meeting.startTime)}</span>
      <span>&#x2022;</span>
      <span>${formatDuration(meeting.startTime, meeting.endTime)}</span>
      <span>&#x2022;</span>
      <span>${participants.size} participants</span>
      <span>&#x2022;</span>
      <span>${screenshots.length} screenshots</span>
    </div>
  </div>

  ${participants.size > 0 ? `
  <div class="section">
    <h2>Participants</h2>
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Joined</th><th>Left</th></tr></thead>
      <tbody>${participantRows}</tbody>
    </table>
  </div>` : ""}

  ${events.length > 0 ? `
  <div class="section">
    <h2>Timeline</h2>
    <div class="timeline">
      ${timelineHtml}
    </div>
  </div>` : ""}

  <div class="section">
    <h2>Screenshots</h2>
    ${screenshots.length > 0 ? `<div class="gallery">${galleryHtml}</div>` : `<div class="empty">No screenshots captured</div>`}
  </div>

  <div class="footer">Generated by Moment &mdash; Meeting Archive</div>

  <div class="lightbox" id="lightbox" onclick="this.classList.remove('open')">
    <img id="lightbox-img" src="" alt="Full screenshot" />
  </div>

  <script>
    document.querySelectorAll('.screenshot-card img').forEach(img => {
      img.addEventListener('click', () => {
        document.getElementById('lightbox-img').src = img.src;
        document.getElementById('lightbox').classList.add('open');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('lightbox').classList.remove('open');
    });
  </script>
</body>
</html>`;
}
```

**Step 2: Build companion**

Run: `npm run build --workspace=companion`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add companion/src/archive-template.ts companion/src/index.ts
git commit -m "feat: HTML archive template with meeting timeline and gallery"
```

---

## Task 8: Update MomentsList with Emoji Display

Show the actual reaction emoji instead of always thumbs-up. Support the new `emoji` field on Moment.

**Files:**
- Modify: `app/src/components/MomentsList.tsx`
- Modify: `app/src/components/MomentsList.test.tsx`

**Step 1: Update MomentsList.tsx**

Update the `triggerLabel` function and emoji display to use `m.emoji`:

```typescript
import type { Moment } from "../types";

interface Props {
  moments: Moment[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const defaultEmoji: Record<Moment["trigger"], string> = {
  reaction: "\u{1F44D}",
  peak: "\u{1F4C8}",
  manual: "\u{1F4F7}",
};

function triggerLabel(m: Moment): string {
  if (m.trigger === "reaction") return m.emoji ? "Reaction" : "Thumbs up";
  if (m.trigger === "peak") return `Peak: ${m.participantCount}`;
  return "Manual";
}

export function MomentsList({ moments }: Props) {
  if (moments.length === 0) {
    return (
      <div className="section">
        <div className="card">
          <div className="section-label">Moments</div>
          <div className="moments-empty">
            <div className="empty-icon">&#128247;</div>
            <div>No moments captured yet</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-label" style={{ padding: "0 4px" }}>Moments ({moments.length})</div>
      <ul className="moments-list">
        {moments.map((m) => (
          <li key={m.id} className={`moment-item ${m.trigger}`}>
            <span className={`moment-trigger-icon ${m.trigger}`}>
              {m.emoji || defaultEmoji[m.trigger]}
            </span>
            <div className="moment-details">
              <div className="moment-time">{formatTime(m.timestamp)}</div>
              <div className="moment-label">{triggerLabel(m)}</div>
            </div>
            <span className={`moment-status ${m.captured ? "saved" : "missed"}`}>
              {m.captured ? "Saved" : "Missed"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 2: Update test for emoji display**

Update the "shows 'Thumbs up' label" test in `MomentsList.test.tsx` and add a new test:

```typescript
it("shows 'Reaction' label when emoji is set", () => {
  render(<MomentsList moments={[makeMoment({ trigger: "reaction", emoji: "\u2764" })]} />);

  expect(screen.getByText("Reaction")).toBeInTheDocument();
  expect(screen.getByText("\u2764")).toBeInTheDocument();
});
```

Update `makeMoment` to support the `emoji` field by adding it to the Moment type import (already optional so no change needed to the helper).

**Step 3: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 4: Commit**

```bash
git add app/src/components/MomentsList.tsx app/src/components/MomentsList.test.tsx
git commit -m "feat: show actual reaction emoji in moments list"
```

---

## Task 9: Integrate Archive in App.tsx

Wire useArchive hook and update addMoment to pass emoji data.

**Files:**
- Modify: `app/src/App.tsx`

**Step 1: Update App.tsx**

Add import and hook usage:

```typescript
import { useArchive } from "./hooks/useArchive";
```

Add the hook call after existing hooks (after `useCompanion()`):

```typescript
useArchive({
  sdkReady: sdk.status === "ready",
  companion,
});
```

Update `useReactionTrigger` call to pass emoji data:

```typescript
useReactionTrigger({
  enabled: reactionEnabled && sdk.status === "ready",
  onTrigger: (emoji: string, unicode: string) => addMoment("reaction", emoji),
});
```

Update `addMoment` signature:

```typescript
const addMoment = useCallback(
  (trigger: Moment["trigger"], emoji?: string) => {
    const p = participantsRef.current;
    const now = new Date();
    const command: CaptureCommand = {
      type: "capture",
      trigger,
      timestamp: now.toISOString(),
      participants: p.names,
      participantCount: p.current,
      meetingTopic: meetingTopicRef.current,
    };

    const captured = companion.capture(command);

    const moment: Moment = {
      id: String(++idCounter.current),
      timestamp: now,
      trigger,
      participantCount: p.current,
      participants: p.names,
      meetingTopic: meetingTopicRef.current,
      captured,
      emoji,
    };

    setMoments((prev) => [...prev, moment]);
  },
  [companion]
);
```

Update peak trigger callback (it doesn't pass emoji):

```typescript
const participants = usePeakTrigger({
  enabled: peakEnabled && sdk.status === "ready",
  onTrigger: () => addMoment("peak"),
});
```

**Step 2: Run tests**

Run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step 3: Build to verify**

Run: `npm run build --workspace=app`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat: integrate archive hook and emoji data in App"
```

---

## Task 10: Build Companion and Final Verification

Build all packages and run all tests.

**Step 1: Build companion**

Run: `npm run build --workspace=companion`
Expected: Build succeeds

**Step 2: Run all tests**

Run: `npm run test:run`
Expected: All tests pass across both workspaces

**Step 3: Commit built companion**

```bash
git add companion/dist/
git commit -m "build: compile companion with archive support"
```

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `app/src/types.ts` | Modify | Add ArchiveEvent, ArchiveData, archive command types, Moment.emoji |
| `app/src/hooks/useReactionTrigger.ts` | Modify | All emojis trigger by default, configurable allowedReactions |
| `app/src/hooks/useReactionTrigger.test.ts` | Modify | Update tests for new behavior |
| `app/src/hooks/useZoomSdk.ts` | Modify | Register new SDK capabilities |
| `app/src/test/zoom-sdk-mock.ts` | Modify | Add getMeetingContext, getMeetingUUID mocks |
| `app/src/hooks/useCompanion.ts` | Modify | Add archive lifecycle methods |
| `app/src/hooks/useCompanion.test.ts` | Modify | Add archive message tests |
| `app/src/hooks/useArchive.ts` | Create | Archive lifecycle orchestration |
| `app/src/hooks/useArchive.test.ts` | Create | Archive hook tests |
| `app/src/components/MomentsList.tsx` | Modify | Show actual emoji, "Reaction" label |
| `app/src/components/MomentsList.test.tsx` | Modify | Add emoji display test |
| `app/src/App.tsx` | Modify | Wire useArchive, pass emoji to addMoment |
| `companion/src/index.ts` | Modify | Archive data management, updated capture flow |
| `companion/src/archive-template.ts` | Create | HTML archive template generator |
