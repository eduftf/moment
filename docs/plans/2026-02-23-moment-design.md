# Moment — Zoom Auto-Screenshot App

## Overview

Zoom Marketplace app that automatically captures screenshots when:
1. A participant gives a thumbs up reaction
2. The meeting reaches a new peak participant count

Silent capture — other participants are not notified.

## Architecture

Two components in a monorepo:

### Zoom App (sidebar)
- React + TypeScript + Vite
- Runs inside Zoom client as a sidebar panel (iframe)
- Detects triggers via Zoom Apps SDK (`onReaction`, `onParticipantChange`)
- Hosted on Cloudflare Pages (static, no server logic)
- Communicates with local companion via WebSocket (`ws://localhost:54321`)

### Companion CLI (optional)
- Node.js CLI tool: `npx moment-capture`
- WebSocket server on `localhost:54321`
- Receives capture commands from the Zoom App
- Takes screenshots using OS tools (`screencapture` on macOS, PowerShell on Windows)
- Saves PNG + JSON metadata to `~/Moment/{meeting-name}/`

### Modes
- **Auto mode**: Companion running → silent automatic screenshot on trigger
- **Manual mode**: No companion → sidebar shows notification + plays sound → user takes screenshot with OS hotkey (Cmd+Shift+3 / PrintScreen)

## Triggers

### 1. Thumbs Up Reaction
- Event: `zoomSdk.onReaction()` filtered for thumbs up emoji
- Debounce: multiple thumbs-ups within 5 seconds → single screenshot
- Capture happens immediately (no countdown, no overlay)

### 2. Peak Participant Count
- Event: `zoomSdk.onParticipantChange()` tracks join/leave
- Screenshot when `currentCount > previousMaxCount`
- Cooldown: max 1 screenshot per 2 minutes for this trigger

## UI: Sidebar Panel

```
┌──────────────────────────┐
│  Moment                  │
│                          │
│  Status: ● Listening     │
│  Participants: 12 (peak) │
│  Companion: ✓ Connected  │
│                          │
│  ─── Triggers ─────────  │
│  [✓] Thumbs up           │
│  [✓] Peak count          │
│                          │
│  ─── Moments (3) ──────  │
│  14:23 — thumbs up       │
│  14:31 — Peak: 15        │
│  14:45 — thumbs up       │
│                          │
│  [ Capture Now ]          │
│                          │
│  Save to: ~/Moment/      │
└──────────────────────────┘
```

- **Status**: listening state, companion connection
- **Trigger toggles**: enable/disable each trigger type
- **Moments list**: captured moments in current meeting (timestamp + trigger)
- **Manual capture**: button for on-demand screenshot
- **No overlay**: no drawWebView, no countdown — completely silent capture

## Screenshot Storage

Path: `~/Moment/{meeting-topic}/`
File naming: `{YYYY-MM-DD_HH-mm-ss}_{trigger}.png`

Companion saves JSON metadata alongside each PNG:
```json
{
  "timestamp": "2026-02-23T14:23:05Z",
  "trigger": "reaction",
  "participants": ["John Doe", "Jane Smith", "Bob Wilson"],
  "participantCount": 12,
  "peakCount": 15,
  "meetingTopic": "Team Standup"
}
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, `@zoom/appssdk`
- **Companion**: Node.js, `ws` (WebSocket), `screencapture` / PowerShell
- **Hosting**: Cloudflare Pages (static site)
- **Package manager**: npm workspaces (monorepo)

## Project Structure

```
moment/
├── app/                        # Zoom App (sidebar)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   │   ├── useZoomSdk.ts       # SDK init + auth
│   │   │   ├── useTriggers.ts      # Reaction & participant tracking
│   │   │   └── useCompanion.ts     # WebSocket to local companion
│   │   └── components/
│   │       ├── StatusBar.tsx
│   │       ├── TriggerSettings.tsx
│   │       ├── MomentsList.tsx
│   │       └── CaptureButton.tsx
│   ├── package.json
│   └── vite.config.ts
├── companion/                  # Local screenshot CLI
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── bin/moment-capture
├── docs/
│   └── plans/
├── package.json                # Workspace root
└── README.md
```

## Zoom Marketplace Registration

Required:
- Zoom Marketplace developer account
- App type: "Zoom App" (General)
- Scopes: `meeting:read` (participant info)
- OAuth: Authorization Code flow (PKCE for client-side)
- Redirect URL: Cloudflare Pages domain

## Not in Scope (v1)

- Cloud storage / server-side storage
- Layers API / visual overlays
- Profile photo fetching (REST API)
- Moment cards / generated images
- Meeting SDK bot integration
