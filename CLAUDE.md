# Moment — Local Meeting Archiver (macOS)

## Overview
Standalone macOS app that captures screenshots, records audio, and produces an on-device transcript + AI summary during any meeting (Zoom, Meet, Teams, Jitsi, Whereby — any visible window). Storage is local-only. Domain: `moment.gtools.space`, repo: `eduftf/moment`.

**The Zoom App + Companion architecture was abandoned on 2026-04-17.** See `docs/superpowers/specs/2026-04-17-moment-standalone-design.md`. The previous code is frozen under `legacy/` and must not receive new features.

## Tech Stack
- **Shell**: Tauri 2.1 (Rust core + React webview)
- **UI**: React 18 + Vite 6 + TypeScript 5.6 (strict)
- **Rust core**: trait-based platform abstraction (`CaptureBackend`, `VisionBackend`, `SpeechBackend`, `LlmBackend`)
- **macOS capture**: `screencapturekit` 0.3 crate (ScreenCaptureKit, macOS 12.3+)
- **AI sidecar (M2+)**: Swift CLI bundled inside `.app`, JSON-lines over stdio
- **Storage**: filesystem under `~/Moment/<meeting>/` + SQLite index at `~/Library/Application Support/Moment/meetings.sqlite`
- **Testing**: `cargo test` (Rust), Vitest + RTL (React), manual smoke in `docs/user/SMOKE.md`
- **Distribution (M6)**: ad-hoc signed DMG via GitHub Releases (no Apple Developer account yet)

## Project Structure
```
moment/
├── src/                         # React UI
│   ├── App.tsx                  # Main window (and tray popover — dispatched by window label)
│   ├── main.tsx                 # Root mount + label dispatch
│   ├── api/tauri.ts             # Typed Tauri invoke wrappers
│   ├── components/              # PermissionBanner, RecentMeetings, …
│   └── hooks/                   # useHotkeys, usePermissions
├── src-tauri/                   # Rust core
│   ├── src/
│   │   ├── lib.rs               # AppHandles, Tauri builder
│   │   ├── main.rs              # Binary entry
│   │   ├── session.rs           # State machine (Idle → Recording → Finalizing → Done)
│   │   ├── storage.rs           # Meeting folders + meeting.json
│   │   ├── index_db.rs          # SQLite meetings index
│   │   ├── tray.rs              # Tray icon + popover handlers
│   │   ├── commands/            # Tauri invoke handlers (capture, session, windows, …)
│   │   └── platform/
│   │       ├── mod.rs           # Trait definitions
│   │       └── macos/           # ScreenCaptureKit impls
│   ├── capabilities/default.json  # Tauri 2 ACL (allowed commands + plugin perms)
│   ├── tauri.conf.json          # App config, tray, windows
│   └── Cargo.toml
├── docs/
│   ├── superpowers/specs/       # Design docs
│   ├── superpowers/plans/       # Implementation plans
│   └── user/SMOKE.md            # M1 manual smoke test
├── legacy/                      # Frozen Zoom-app + Node companion (do NOT modify)
└── README.md                    # User-facing
```

## Commands
```bash
npm install                 # Install JS deps
npm run tauri dev           # Dev run (Tauri + Vite)
npm run typecheck           # TypeScript
npm run test:run            # Vitest (pass-with-no-tests during M1)
cd src-tauri && cargo test  # Rust tests (session, storage, platform, index_db)
```

## Milestone Status
| Milestone | Scope | Status |
|---|---|---|
| M1 | Capture foundation — window picker + manual capture + SQLite index + hotkeys + tray | **✅ automated gates passed; live smoke gated on user** |
| M2 | Peak detection via Swift sidecar + Vision framework | **✅ infrastructure landed; 4-person Zoom smoke gated on user** |
| M3 | Audio + on-device transcript (SFSpeechRecognizer) | ⏳ research committed (`docs/superpowers/research/2026-04-24-m3-transcript-research.md`), spec next |
| M4 | AI summary + action items (Foundation Models) | ⏳ research committed (`docs/superpowers/research/2026-04-24-m4-ai-summary-research.md`), spec next |
| M5 | Interactive dashboard (gallery + transcript + summary + notes) | ⏳ |
| M6 | Ad-hoc signed DMG, GitHub Releases, landing refresh | ⏳ |
| M7 | Platform abstraction polish, community onboarding | ⏳ |

See `NEXT-STEPS.md` at the repo root for the canonical "what's next" list, including user-gated items (live smoke, face fixtures, push decision).

## Key Patterns
- **Meeting folder is source of truth.** SQLite is a cache for fast listing — a missing row must not prevent a meeting from opening on disk.
- **No panics on the happy path.** Rust errors flow to UI toasts. Permission state → persistent banner, not toasts.
- **camelCase over the wire.** Rust serde uses `rename_all_fields = "camelCase"`; TypeScript types match directly. The `SessionState` test in `session.rs` is the canonical shape check.
- **macOS-first.** Windows/Linux impls are community-PR slots behind the same traits; do not unify their code paths yet.

## Security
- Everything local. No cloud. No telemetry.
- Screen Recording + Microphone + Speech Recognition + Accessibility (hotkeys) permissions requested on first need.
- Apple Intelligence availability probed at startup (M4); fallback to bundled whisper.cpp planned if UA not supported.

## Legacy
`legacy/zoom-app/` and `legacy/companion/` are the pre-pivot codebase. Frozen 2026-04-17. Read-only. The previous Zoom Marketplace listing and `moment.gtools.space` landing page are intentionally left live but will be rewritten in M6.
