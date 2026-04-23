# Moment

**Local macOS app that archives the best moments of your meetings.**

Moment is a standalone menu-bar app that captures screenshots during any meeting — Zoom, Google Meet, Microsoft Teams, Jitsi, Whereby, or any visible window — and builds a local archive: gallery, transcript, AI summary, notes. Everything on-device. Nothing leaves your Mac.

> **Status: M1 — Capture Foundation.** Window picker, manual capture, and meeting-folder layout work end-to-end. Peak detection, audio, transcript, and AI summary land in M2–M4. Track progress in `docs/superpowers/plans/`.

## How it works (M1)

1. Click the Moment tray icon → a popover appears.
2. Click **Start** to begin recording the first visible window. (Window picking UI comes in M5 — for M1 the first visible window is picked automatically.)
3. Press **⌘⇧Space** to capture a PNG at any moment.
4. Press **⌘⇧M** to end the session; a `meeting.json` is written alongside the screenshots.

All data lives locally in `~/Moment/<meeting>/`. A fast index lives at `~/Library/Application Support/Moment/meetings.sqlite`.

## Stack

- Tauri 2 + React 18 + TypeScript
- Rust core with trait-based platform abstraction (`CaptureBackend`, `VisionBackend`, `SpeechBackend`, `LlmBackend`)
- macOS: ScreenCaptureKit via the [`screencapturekit`](https://crates.io/crates/screencapturekit) crate
- SQLite for the meetings index
- Apple Intelligence (M4): Foundation Models + Vision + SFSpeechRecognizer

## Development

Requires macOS 12.3+, Rust 1.80+, Node 22+, Xcode Command Line Tools.

```bash
git clone https://github.com/eduftf/moment.git
cd moment
npm install
npm run tauri dev
```

First launch will prompt for **Screen Recording** permission. Grant it in **System Settings → Privacy & Security → Screen Recording** and the in-app banner will clear automatically.

## Tests

```bash
cd src-tauri && cargo test        # Rust unit + integration tests
cd ..          && npm run test:run # Vitest (UI tests land in M5)
```

Manual smoke: `docs/user/SMOKE.md`.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Capture Foundation — tray + hotkeys + manual capture + SQLite index | 🚧 closing |
| M2 | Peak detection via Swift sidecar + Vision framework | ⏳ |
| M3 | Audio capture + on-device transcript (SFSpeechRecognizer) | ⏳ |
| M4 | AI summary + action items (Foundation Models) | ⏳ |
| M5 | Interactive dashboard (gallery + transcript + summary + notes) | ⏳ |
| M6 | Ad-hoc signed DMG, GitHub Releases, landing refresh | ⏳ |
| M7 | Platform abstraction polish, community onboarding docs | ⏳ |

Community PRs welcome for Windows and Linux platform implementations — see the `CaptureBackend` / `VisionBackend` / `SpeechBackend` / `LlmBackend` traits in `src-tauri/src/platform/`.

## License

MIT — see [LICENSE](LICENSE).

## Legacy

The original Zoom App + Companion architecture lives under `legacy/`. It is frozen (2026-04-17) and read-only. Do not add features there — the standalone pivot is documented in `docs/superpowers/specs/2026-04-17-moment-standalone-design.md`.
