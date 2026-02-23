# Moment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Zoom Marketplace sidebar app that silently captures screenshots on thumbs-up reactions and peak participant count, with an optional local companion CLI for auto-capture.

**Architecture:** Monorepo with two packages — `app/` (React + Vite Zoom sidebar) and `companion/` (Node.js CLI screenshot tool). The sidebar detects triggers via Zoom Apps SDK events, communicates with the local companion via WebSocket on `localhost:54321`. No backend server — static hosting on Cloudflare Pages.

**Tech Stack:** React 18, TypeScript, Vite, `@zoom/appssdk` v0.16, Node.js CLI with `ws`, npm workspaces.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (workspace root)
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/vite.config.ts`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx` (minimal placeholder)
- Create: `app/src/App.css`
- Create: `companion/package.json`
- Create: `companion/tsconfig.json`
- Create: `.gitignore`

**Step 1: Create workspace root package.json**

```json
{
  "name": "moment",
  "private": true,
  "workspaces": ["app", "companion"]
}
```

**Step 2: Create app/package.json**

```json
{
  "name": "@moment/app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@zoom/appssdk": "^0.16.36",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.1.0"
  }
}
```

**Step 3: Create app/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 4: Create app/vite.config.ts**

Zoom Apps require HTTPS and don't support localhost. Use ngrok for development.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // When using ngrok, HMR websocket must connect through the tunnel
    hmr: {
      clientPort: 443,
    },
  },
});
```

**Step 5: Create app/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Moment</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create app/src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 7: Create app/src/App.tsx (placeholder)**

```tsx
export default function App() {
  return (
    <div className="app">
      <h1>Moment</h1>
      <p>Initializing...</p>
    </div>
  );
}
```

**Step 8: Create app/src/App.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: #232333;
  background: #f7f7fa;
}

.app {
  padding: 16px;
  max-width: 400px;
}
```

**Step 9: Create companion/package.json**

```json
{
  "name": "moment-capture",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "moment-capture": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13",
    "typescript": "^5.7.3"
  }
}
```

**Step 10: Create companion/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 11: Create .gitignore**

```
node_modules/
dist/
.env
*.local
```

**Step 12: Install dependencies**

Run: `cd /Users/mykhailog/Local/moment && npm install`

**Step 13: Verify app builds**

Run: `cd /Users/mykhailog/Local/moment && npm run dev --workspace=app`
Expected: Vite dev server starts on port 3000.

**Step 14: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with app and companion packages"
```

---

## Task 2: Zoom SDK Hook

**Files:**
- Create: `app/src/hooks/useZoomSdk.ts`
- Modify: `app/src/App.tsx`

**Context:** The Zoom Apps SDK must call `config()` before any other API. This hook initializes the SDK, declares capabilities, and exposes the running context. No OAuth needed — we only use SDK events, not REST API.

**Step 1: Create app/src/hooks/useZoomSdk.ts**

```typescript
import { useState, useEffect } from "react";
import zoomSdk from "@zoom/appssdk";

export type SdkStatus = "loading" | "ready" | "error";

export interface ZoomContext {
  status: SdkStatus;
  error: string | null;
  runningContext: string | null;
  userRole: string | null;
  userName: string | null;
}

const CAPABILITIES = [
  "onReaction",
  "onEmojiReaction",
  "onParticipantChange",
  "getMeetingParticipants",
  "getMeetingContext",
  "getUserContext",
] as const;

export function useZoomSdk(): ZoomContext {
  const [status, setStatus] = useState<SdkStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [runningContext, setRunningContext] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const configResponse = await zoomSdk.config({
          capabilities: [...CAPABILITIES],
        });

        if (cancelled) return;

        setRunningContext(configResponse.runningContext);

        const unsupported = configResponse.unsupportedApis;
        if (unsupported.length > 0) {
          console.warn("Unsupported APIs:", unsupported);
        }

        // Get user info
        try {
          const user = await zoomSdk.getUserContext();
          if (!cancelled) {
            setUserRole(user.role);
            setUserName(user.screenName);
          }
        } catch {
          // getUserContext may fail outside meetings
        }

        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "SDK init failed");
          setStatus("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { status, error, runningContext, userRole, userName };
}
```

**Step 2: Update app/src/App.tsx to use the hook**

```tsx
import { useZoomSdk } from "./hooks/useZoomSdk";

export default function App() {
  const sdk = useZoomSdk();

  if (sdk.status === "loading") {
    return <div className="app"><p>Connecting to Zoom...</p></div>;
  }

  if (sdk.status === "error") {
    return (
      <div className="app">
        <p>Failed to connect: {sdk.error}</p>
        <p>Make sure this app is running inside Zoom.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Moment</h1>
      <p>Context: {sdk.runningContext}</p>
      <p>User: {sdk.userName} ({sdk.userRole})</p>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add app/src/hooks/useZoomSdk.ts app/src/App.tsx
git commit -m "feat: add Zoom SDK initialization hook"
```

---

## Task 3: Trigger Detection — Reactions

**Files:**
- Create: `app/src/hooks/useReactionTrigger.ts`
- Create: `app/src/types.ts`

**Context:** Listen to `onEmojiReaction` (newer API) for thumbs-up reactions. Debounce: multiple thumbs-ups within 5 seconds produce a single capture event. The thumbs up emoji unicode is `U+1F44D`.

**Step 1: Create app/src/types.ts**

```typescript
export interface Moment {
  id: string;
  timestamp: Date;
  trigger: "reaction" | "peak" | "manual";
  participantCount: number;
  participants: string[];
  meetingTopic: string;
  captured: boolean; // true if companion took the screenshot
}

export interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}
```

**Step 2: Create app/src/hooks/useReactionTrigger.ts**

```typescript
import { useEffect, useRef, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const THUMBS_UP_UNICODE = "U+1F44D";
const DEBOUNCE_MS = 5000;

interface UseReactionTriggerOptions {
  enabled: boolean;
  onTrigger: () => void;
}

export function useReactionTrigger({ enabled, onTrigger }: UseReactionTriggerOptions) {
  const lastTriggerRef = useRef<number>(0);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const handler = useCallback((event: { unicode?: string; reaction?: { unicode?: string } }) => {
    // Support both onReaction (event.unicode) and onEmojiReaction (event.reaction.unicode)
    const unicode = event.unicode ?? event.reaction?.unicode;
    if (unicode !== THUMBS_UP_UNICODE) return;

    const now = Date.now();
    if (now - lastTriggerRef.current < DEBOUNCE_MS) return;

    lastTriggerRef.current = now;
    onTriggerRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Try newer API first, fall back to older
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

**Step 3: Commit**

```bash
git add app/src/types.ts app/src/hooks/useReactionTrigger.ts
git commit -m "feat: add reaction trigger hook with debounce"
```

---

## Task 4: Trigger Detection — Peak Participants

**Files:**
- Create: `app/src/hooks/usePeakTrigger.ts`

**Context:** Track participant count via `onParticipantChange`. Fire trigger when count exceeds previous peak. Cooldown: 2 minutes between triggers. Also maintain a participants list from join/leave events (since `getMeetingParticipants` is host-only).

**Step 1: Create app/src/hooks/usePeakTrigger.ts**

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

interface UsePeakTriggerOptions {
  enabled: boolean;
  onTrigger: (count: number) => void;
}

export interface ParticipantState {
  current: number;
  peak: number;
  names: string[];
}

export function usePeakTrigger({ enabled, onTrigger }: UsePeakTriggerOptions): ParticipantState {
  const [state, setState] = useState<ParticipantState>({ current: 1, peak: 1, names: [] });
  const peakRef = useRef(1);
  const lastTriggerRef = useRef(0);
  const namesRef = useRef(new Map<string, string>()); // uuid -> name
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  // Try to get initial participant list (host/cohost only)
  useEffect(() => {
    async function fetchInitial() {
      try {
        const result = await zoomSdk.getMeetingParticipants();
        const participants = result.participants;
        for (const p of participants) {
          namesRef.current.set(p.participantUUID, p.screenName);
        }
        const count = participants.length;
        peakRef.current = count;
        setState({
          current: count,
          peak: count,
          names: participants.map((p) => p.screenName),
        });
      } catch {
        // Not host/cohost, or not in meeting — that's fine
      }
    }
    fetchInitial();
  }, []);

  const handler = useCallback(
    (event: { participants: Array<{ status: string; screenName: string; participantUUID: string }> }) => {
      for (const p of event.participants) {
        if (p.status === "join") {
          namesRef.current.set(p.participantUUID, p.screenName);
        } else {
          namesRef.current.delete(p.participantUUID);
        }
      }

      const count = namesRef.current.size;
      const names = [...namesRef.current.values()];
      const newPeak = Math.max(peakRef.current, count);
      const isPeakBroken = count > peakRef.current;

      if (isPeakBroken && enabled) {
        const now = Date.now();
        if (now - lastTriggerRef.current >= COOLDOWN_MS) {
          lastTriggerRef.current = now;
          onTriggerRef.current(count);
        }
      }

      peakRef.current = newPeak;
      setState({ current: count, peak: newPeak, names });
    },
    [enabled]
  );

  useEffect(() => {
    try {
      zoomSdk.addEventListener("onParticipantChange", handler);
    } catch {
      // not available
    }
    return () => {
      try { zoomSdk.removeEventListener("onParticipantChange", handler); } catch {}
    };
  }, [handler]);

  return state;
}
```

**Step 2: Commit**

```bash
git add app/src/hooks/usePeakTrigger.ts
git commit -m "feat: add peak participant trigger hook with cooldown"
```

---

## Task 5: Companion WebSocket Hook

**Files:**
- Create: `app/src/hooks/useCompanion.ts`

**Context:** The sidebar connects to the local companion via WebSocket on `ws://localhost:54321`. If companion is not running, the connection silently fails and the app falls back to manual mode. Reconnects every 5 seconds.

**Step 1: Create app/src/hooks/useCompanion.ts**

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import type { CaptureCommand } from "../types";

const WS_URL = "ws://localhost:54321";
const RECONNECT_MS = 5000;

export function useCompanion() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
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

  const capture = useCallback((command: CaptureCommand): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false; // companion not available
    }
    wsRef.current.send(JSON.stringify(command));
    return true;
  }, []);

  return { connected, capture };
}
```

**Step 2: Commit**

```bash
git add app/src/hooks/useCompanion.ts
git commit -m "feat: add companion WebSocket hook with auto-reconnect"
```

---

## Task 6: UI Components

**Files:**
- Create: `app/src/components/StatusBar.tsx`
- Create: `app/src/components/TriggerSettings.tsx`
- Create: `app/src/components/MomentsList.tsx`
- Create: `app/src/components/CaptureButton.tsx`

**Step 1: Create app/src/components/StatusBar.tsx**

```tsx
import type { ParticipantState } from "../hooks/usePeakTrigger";

interface Props {
  sdkReady: boolean;
  companionConnected: boolean;
  participants: ParticipantState;
}

export function StatusBar({ sdkReady, companionConnected, participants }: Props) {
  return (
    <div className="status-bar">
      <div className="status-row">
        <span className={`dot ${sdkReady ? "green" : "yellow"}`} />
        <span>{sdkReady ? "Listening" : "Connecting..."}</span>
      </div>
      <div className="status-row">
        <span>Participants: {participants.current}</span>
        <span className="muted"> (peak: {participants.peak})</span>
      </div>
      <div className="status-row">
        <span className={`dot ${companionConnected ? "green" : "gray"}`} />
        <span>
          Companion: {companionConnected ? "Connected" : "Not running"}
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Create app/src/components/TriggerSettings.tsx**

```tsx
interface Props {
  reactionEnabled: boolean;
  peakEnabled: boolean;
  onToggleReaction: () => void;
  onTogglePeak: () => void;
}

export function TriggerSettings({ reactionEnabled, peakEnabled, onToggleReaction, onTogglePeak }: Props) {
  return (
    <div className="section">
      <h3>Triggers</h3>
      <label className="toggle-row">
        <input type="checkbox" checked={reactionEnabled} onChange={onToggleReaction} />
        <span>Thumbs up reaction</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={peakEnabled} onChange={onTogglePeak} />
        <span>Peak participant count</span>
      </label>
    </div>
  );
}
```

**Step 3: Create app/src/components/MomentsList.tsx**

```tsx
import type { Moment } from "../types";

interface Props {
  moments: Moment[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function triggerLabel(m: Moment): string {
  if (m.trigger === "reaction") return "thumbs up";
  if (m.trigger === "peak") return `Peak: ${m.participantCount}`;
  return "manual";
}

export function MomentsList({ moments }: Props) {
  if (moments.length === 0) {
    return (
      <div className="section">
        <h3>Moments</h3>
        <p className="muted">No moments captured yet</p>
      </div>
    );
  }

  return (
    <div className="section">
      <h3>Moments ({moments.length})</h3>
      <ul className="moments-list">
        {moments.map((m) => (
          <li key={m.id} className="moment-item">
            <span className={`capture-icon ${m.captured ? "auto" : "manual"}`}>
              {m.captured ? "A" : "M"}
            </span>
            <span>{formatTime(m.timestamp)}</span>
            <span className="muted"> — {triggerLabel(m)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 4: Create app/src/components/CaptureButton.tsx**

```tsx
interface Props {
  onClick: () => void;
}

export function CaptureButton({ onClick }: Props) {
  return (
    <button className="capture-btn" onClick={onClick}>
      Capture Now
    </button>
  );
}
```

**Step 5: Commit**

```bash
git add app/src/components/
git commit -m "feat: add sidebar UI components"
```

---

## Task 7: Wire Everything in App.tsx

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.css`

**Context:** Connect all hooks and components. When a trigger fires: (1) send capture command to companion, (2) add moment to list. If companion is not connected, the moment is still logged but `captured: false` (manual mode). Use a ref for participant state to avoid circular dependency between `addMoment` and `usePeakTrigger`.

**Step 1: Rewrite app/src/App.tsx**

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import zoomSdk from "@zoom/appssdk";
import { useZoomSdk } from "./hooks/useZoomSdk";
import { useReactionTrigger } from "./hooks/useReactionTrigger";
import { usePeakTrigger, type ParticipantState } from "./hooks/usePeakTrigger";
import { useCompanion } from "./hooks/useCompanion";
import { StatusBar } from "./components/StatusBar";
import { TriggerSettings } from "./components/TriggerSettings";
import { MomentsList } from "./components/MomentsList";
import { CaptureButton } from "./components/CaptureButton";
import type { Moment, CaptureCommand } from "./types";

export default function App() {
  const sdk = useZoomSdk();
  const companion = useCompanion();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [reactionEnabled, setReactionEnabled] = useState(true);
  const [peakEnabled, setPeakEnabled] = useState(true);
  const meetingTopicRef = useRef("Meeting");
  const idCounter = useRef(0);
  const participantsRef = useRef<ParticipantState>({ current: 1, peak: 1, names: [] });

  // Fetch meeting topic once SDK is ready
  useEffect(() => {
    if (sdk.status !== "ready") return;
    zoomSdk.getMeetingContext().then((ctx: { meetingTopic?: string }) => {
      if (ctx.meetingTopic) meetingTopicRef.current = ctx.meetingTopic;
    }).catch(() => {});
  }, [sdk.status]);

  const addMoment = useCallback(
    (trigger: Moment["trigger"]) => {
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
      };

      setMoments((prev) => [...prev, moment]);
    },
    [companion]
  );

  const participants = usePeakTrigger({
    enabled: peakEnabled && sdk.status === "ready",
    onTrigger: () => addMoment("peak"),
  });

  // Keep ref in sync
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useReactionTrigger({
    enabled: reactionEnabled && sdk.status === "ready",
    onTrigger: () => addMoment("reaction"),
  });

  const handleManualCapture = useCallback(() => {
    addMoment("manual");
  }, [addMoment]);

  if (sdk.status === "loading") {
    return <div className="app"><p>Connecting to Zoom...</p></div>;
  }

  if (sdk.status === "error") {
    return (
      <div className="app">
        <h1>Moment</h1>
        <p className="error">Not connected to Zoom</p>
        <p className="muted">{sdk.error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Moment</h1>
      <StatusBar
        sdkReady={sdk.status === "ready"}
        companionConnected={companion.connected}
        participants={participants}
      />
      <TriggerSettings
        reactionEnabled={reactionEnabled}
        peakEnabled={peakEnabled}
        onToggleReaction={() => setReactionEnabled((v) => !v)}
        onTogglePeak={() => setPeakEnabled((v) => !v)}
      />
      <MomentsList moments={moments} />
      <CaptureButton onClick={handleManualCapture} />
    </div>
  );
}
```

**Step 2: Update app/src/App.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: #232333;
  background: #f7f7fa;
}

.app {
  padding: 16px;
  max-width: 400px;
}

h1 {
  font-size: 20px;
  margin-bottom: 12px;
}

h3 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #666;
  margin-bottom: 8px;
}

.section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.status-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot.green { background: #22c55e; }
.dot.yellow { background: #eab308; }
.dot.gray { background: #9ca3af; }

.muted {
  color: #888;
  font-size: 12px;
}

.error {
  color: #dc2626;
  font-weight: 500;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
}

.moments-list {
  list-style: none;
}

.moment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.capture-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}
.capture-icon.auto { background: #dcfce7; color: #16a34a; }
.capture-icon.manual { background: #fef3c7; color: #d97706; }

.capture-btn {
  margin-top: 16px;
  width: 100%;
  padding: 10px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.capture-btn:hover { background: #1d4ed8; }
.capture-btn:active { background: #1e40af; }
```

**Step 3: Verify build compiles**

Run: `cd /Users/mykhailog/Local/moment && npx --workspace=app tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add app/src/App.tsx app/src/App.css
git commit -m "feat: wire up hooks and components in App"
```

---

## Task 8: Companion CLI

**Files:**
- Create: `companion/src/index.ts`

**Context:** Node.js CLI that starts a WebSocket server on port 54321. When it receives a capture command, it takes a screenshot using OS tools and saves the PNG + JSON metadata to `~/Moment/{meeting-topic}/`. Uses `execFile` (not `exec`) to avoid shell injection.

**Step 1: Create companion/src/index.ts**

```typescript
#!/usr/bin/env node

import { WebSocketServer } from "ws";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const PORT = 54321;
const BASE_DIR = join(homedir(), "Moment");

interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim().replace(/\s+/g, "-") || "meeting";
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function takeScreenshot(filepath: string): Promise<void> {
  const os = platform();

  return new Promise((resolve, reject) => {
    if (os === "darwin") {
      execFile("screencapture", ["-x", filepath], (error) => {
        if (error) reject(error);
        else resolve();
      });
    } else if (os === "win32") {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
        $bitmap.Save('${filepath}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
      execFile("powershell", ["-Command", psScript], (error) => {
        if (error) reject(error);
        else resolve();
      });
    } else {
      // Linux: try gnome-screenshot
      execFile("gnome-screenshot", ["-f", filepath], (error) => {
        if (error) {
          // Fallback to ImageMagick import
          execFile("import", ["-window", "root", filepath], (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    }
  });
}

async function handleCapture(data: CaptureCommand): Promise<void> {
  const dir = join(BASE_DIR, sanitize(data.meetingTopic));
  await mkdir(dir, { recursive: true });

  const ts = formatTimestamp(data.timestamp);
  const baseName = `${ts}_${data.trigger}`;
  const pngPath = join(dir, `${baseName}.png`);
  const jsonPath = join(dir, `${baseName}.json`);

  await takeScreenshot(pngPath);

  const metadata = {
    timestamp: data.timestamp,
    trigger: data.trigger,
    participants: data.participants,
    participantCount: data.participantCount,
    meetingTopic: data.meetingTopic,
  };
  await writeFile(jsonPath, JSON.stringify(metadata, null, 2));

  console.log(`Captured: ${pngPath}`);
}

const wss = new WebSocketServer({ port: PORT });

console.log(`Moment Companion listening on ws://localhost:${PORT}`);
console.log(`Screenshots will be saved to ${BASE_DIR}/`);

wss.on("connection", (ws) => {
  console.log("Zoom App connected");

  ws.on("message", async (raw) => {
    try {
      const data: CaptureCommand = JSON.parse(raw.toString());
      if (data.type === "capture") {
        await handleCapture(data);
        ws.send(JSON.stringify({ type: "captured", timestamp: data.timestamp }));
      }
    } catch (e) {
      console.error("Error:", e);
      ws.send(JSON.stringify({ type: "error", message: String(e) }));
    }
  });

  ws.on("close", () => console.log("Zoom App disconnected"));
});
```

**Step 2: Build companion**

Run: `cd /Users/mykhailog/Local/moment && npm run build --workspace=companion`
Expected: TypeScript compiles to `companion/dist/index.js`.

**Step 3: Test companion locally**

Run: `node /Users/mykhailog/Local/moment/companion/dist/index.js`
Expected: Prints "Moment Companion listening on ws://localhost:54321".
Stop with Ctrl+C.

**Step 4: Commit**

```bash
git add companion/src/index.ts
git commit -m "feat: add companion CLI with screenshot capture"
```

---

## Task 9: GitHub Repo & Cloudflare Pages

**Files:**
- No new code files

**Step 1: Create GitHub repo under eduftf org**

```bash
cd /Users/mykhailog/Local/moment
gh repo create eduftf/moment --public --source=. --push
```

**Step 2: Set up Cloudflare Pages**

This is manual — go to Cloudflare dashboard:
1. Pages > Create project > Connect to Git > Select `eduftf/moment`
2. Build settings:
   - Build command: `npm run build --workspace=app`
   - Build output directory: `app/dist`
   - Root directory: `/`
3. Deploy

Or via Wrangler CLI:
```bash
cd /Users/mykhailog/Local/moment
npx wrangler pages project create moment
npm run build --workspace=app
npx wrangler pages deploy app/dist --project-name=moment
```

**Step 3: Commit any config changes**

```bash
git add -A && git commit -m "chore: configure deployment" || true
```

---

## Task 10: Zoom Marketplace App Registration

**Files:**
- Create: `docs/zoom-marketplace-setup.md` (setup guide)

**Step 1: Write marketplace setup guide**

Create `docs/zoom-marketplace-setup.md` with these steps:

1. Go to https://marketplace.zoom.us > Develop > Build App > General App
2. App Name: "Moment"
3. Basic Information: fill in company, description
4. OAuth:
   - Redirect URL: `https://moment.pages.dev/` (your CF Pages URL)
   - Add to Domain Allow List: `moment.pages.dev`, `localhost`
5. Surface tab > Zoom Meetings:
   - Home URL: `https://moment.pages.dev/` (production) or ngrok URL (development)
   - Add SDK capabilities: `onReaction`, `onEmojiReaction`, `onParticipantChange`, `getMeetingParticipants`, `getMeetingContext`, `getUserContext`
6. Scopes: `zoomapp:inmeeting` (default)
7. Local Test: Add to your Zoom account

For development:
- Run `ngrok http 3000`
- Set Home URL to ngrok HTTPS URL
- Add ngrok domain to Domain Allow List
- Run `npm run dev --workspace=app`
- Open Zoom, join meeting, app appears in sidebar

**Step 2: Commit**

```bash
git add docs/zoom-marketplace-setup.md
git commit -m "docs: add Zoom Marketplace setup guide"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Project scaffolding | root + app + companion package.json, configs |
| 2 | Zoom SDK init hook | `useZoomSdk.ts`, `App.tsx` |
| 3 | Reaction trigger | `types.ts`, `useReactionTrigger.ts` |
| 4 | Peak participant trigger | `usePeakTrigger.ts` |
| 5 | Companion WebSocket | `useCompanion.ts` |
| 6 | UI components | `StatusBar`, `TriggerSettings`, `MomentsList`, `CaptureButton` |
| 7 | Wire everything | `App.tsx`, `App.css` |
| 8 | Companion CLI | `companion/src/index.ts` |
| 9 | GitHub repo & deploy | gh + Cloudflare Pages |
| 10 | Marketplace registration | setup guide doc |
