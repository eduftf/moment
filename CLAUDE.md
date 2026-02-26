# Moment — Zoom Screenshot Companion

## Overview
Zoom App that captures screenshots during meetings triggered by reactions, participant peaks, or manual clicks. Monorepo: React SPA (app) + Node.js CLI (companion). Domain: `moment.gtools.space`, repo: `eduftf/moment`.

## Tech Stack
- **App**: React 18 + Vite 6 + TypeScript (strict)
- **Companion**: Node.js CLI, WebSocket server (port 54321)
- **Zoom**: `@zoom/appssdk` for reactions, participants, meeting context
- **Testing**: Vitest + React Testing Library
- **Hosting**: Cloudflare Pages (auto-deploy on push to main)

## Project Structure
```
moment/
├── app/                    # Zoom App (React + Vite)
│   ├── src/
│   │   ├── App.tsx         # Main orchestrator
│   │   ├── components/     # StatusBar, TriggerSettings, MomentsList, CaptureButton
│   │   └── hooks/          # useZoomSdk, useReactionTrigger, usePeakTrigger, useCompanion
│   └── dist/               # Build output
├── companion/              # CLI screenshot tool (moment-capture)
│   └── src/
│       ├── index.ts        # WebSocket server, screenshot capture
│       └── utils.ts        # sanitize, formatTimestamp
├── docs/                   # Zoom marketplace setup guide
└── .github/workflows/      # deploy.yml (test + CF Pages deploy)
```

## Commands
```bash
npm install                         # Install all workspaces
npm run dev --workspace=app         # Vite dev server (:3000)
npm run dev --workspace=companion   # CLI watch mode
npm run build --workspace=app       # Build for production
npm test                            # Run all tests (watch)
npm run test:run                    # Run tests once (CI)
```

## Key Architecture
- **Triggers**: Reaction (thumbs-up, 5s debounce), Peak (new participant max, 2min cooldown), Manual
- **Data flow**: App detects trigger → WebSocket CaptureCommand → Companion takes screenshot → saves to `~/Moment/{topic}/`
- **WebSocket**: Auto-reconnect every 5s if companion disconnects
- **Screenshot**: Native OS tools (macOS: `screencapture`, Windows: PowerShell, Linux: gnome-screenshot)

## Deploy
- GitHub Actions: push to main → `npm ci` → `npm run test:run` → build app → wrangler pages deploy
- Commit message limited to 80 chars (Cyrillic fix for CF Pages API)

## Security
- Companion runs locally only (localhost:54321)
- ngrok tunnel required for dev (Vite HMR clientPort: 443)
