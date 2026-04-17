# Moment — Standalone App Pivot (Design Spec)

**Date:** 2026-04-17
**Status:** Design approved, ready for implementation plan
**Supersedes:** Zoom-app-only architecture (current `app/` + `companion/`)

---

## 1. Context & Motivation

### Why pivot

The current Moment architecture requires users to:
1. Create their own Zoom Developer App (Marketplace rejected public distribution — OS-level screen capture not permissible inside Zoom sidebar iframe).
2. Install a Zoom App into their account.
3. Install a separate Companion CLI.
4. Configure ngrok or deploy a static site for dev.

For a consumer productivity tool this is fatal friction. Zoom also locks Moment to a single conferencing platform.

### What Moment actually needs to be

A local macOS desktop app that:
- Runs before/during any meeting (Zoom, Meet, Teams, Jitsi, Whereby, or any window).
- Automatically captures screenshots when **new participant peaks** are detected.
- Supports manual capture via **global hotkey** and **voice trigger**.
- Records system audio and produces a **local transcript** on-device.
- Generates an **AI summary + action items** on-device using Apple Intelligence.
- Presents an **interactive post-meeting dashboard** (gallery, transcript, summary, notes, chat export).
- Stores everything locally, no cloud.

### Core cut

- **Zoom sidebar → legacy.** Existing `app/` (React) and `companion/` (Node CLI) move to `legacy/` as read-only references. We do not maintain them.
- **No Zoom SDK dependency in the new build.** We trade precise reaction events for OS-level universal capture.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Moment.app (Tauri)                        │
│                                                               │
│  React UI  ←──Tauri IPC──→  Rust Core  ──spawn──→ Swift AI   │
│  (menubar,                  (traits,              Sidecar     │
│   dashboard,                state,                (child      │
│   settings)                 storage,              process)    │
│                             schedulers)                       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
         │                           │                      │
         ▼                           ▼                      ▼
   ~/Library/                  ~/Moment/           Apple Intelligence
   Application Support/        <meeting>/          Foundation Models
   Moment/                     screenshots/        Vision framework
   (settings, cache)           transcript.*        SFSpeechRecognizer
                               summary.md          (macOS 26+, M1+)
                               meeting.json
                               index.html
```

### Three tiers

1. **React UI** (reuses code from existing `app/`)
   - Menubar popover: record/stop, status, last meeting.
   - Dashboard window: per-meeting view (gallery, transcript, summary, notes).
   - Settings window: hotkeys, voice trigger, output folder, AI toggle.

2. **Rust Core** (new, built with Tauri 2.x)
   - Trait-based platform abstraction — see §3.
   - State machine: Idle → SelectingWindow → Recording → Finalizing → Done.
   - Storage: local filesystem + SQLite for meeting index.
   - IPC: Tauri commands for UI ↔ Rust; JSON-lines over stdin/stdout for Rust ↔ Sidecar.

3. **Swift AI Sidecar** (`moment-ai-sidecar` bundled inside `.app`)
   - Compact CLI that reads JSON requests from stdin, writes JSON responses to stdout.
   - Wraps Foundation Models (summary, action items), Vision (face detection), SFSpeechRecognizer (transcript).
   - Gracefully reports `unavailable` states back to Rust so core can fall back.

---

## 3. Platform Abstraction Layer

Core concept: every platform-specific operation is a Rust trait. macOS implementations are default; Windows/Linux are stubs that return `Unsupported` until a community PR lands.

```rust
// crates/moment-core/src/platform/mod.rs

#[async_trait]
pub trait CaptureBackend: Send + Sync {
    async fn list_windows(&self) -> Result<Vec<WindowInfo>>;
    async fn start_stream(&self, window_id: WindowId, cfg: StreamConfig) -> Result<StreamHandle>;
    async fn capture_frame(&self, handle: &StreamHandle) -> Result<Frame>;
    async fn stop_stream(&self, handle: StreamHandle) -> Result<()>;
}

#[async_trait]
pub trait VisionBackend: Send + Sync {
    async fn count_faces(&self, frame: &Frame) -> Result<usize>;
}

#[async_trait]
pub trait SpeechBackend: Send + Sync {
    async fn start_transcription(&self, audio: AudioSource) -> Result<TranscriptStream>;
    async fn stop_transcription(&self, stream: TranscriptStream) -> Result<String>;
}

#[async_trait]
pub trait LlmBackend: Send + Sync {
    async fn summarize(&self, transcript: &str) -> Result<Summary>;
    async fn extract_action_items(&self, transcript: &str) -> Result<Vec<ActionItem>>;
    fn availability(&self) -> Availability;
}
```

### macOS implementations

| Trait | Implementation |
|---|---|
| `CaptureBackend` | `screencapturekit-rs` crate (ScreenCaptureKit, macOS 12.3+) |
| `VisionBackend` | Swift sidecar → `VNDetectHumanRectanglesRequest` |
| `SpeechBackend` | Swift sidecar → `SFSpeechRecognizer` (on-device mode) |
| `LlmBackend` | Swift sidecar → Foundation Models (`SystemLanguageModel`) |

### Non-macOS fallbacks (future community PRs)

| Trait | Fallback sketch |
|---|---|
| `CaptureBackend` | Windows: `windows-rs` + Windows.Graphics.Capture. Linux: pipewire or `xcap` crate. |
| `VisionBackend` | ONNX Runtime + YOLO-face in Rust (works everywhere). |
| `SpeechBackend` | `whisper-rs` binding to whisper.cpp (works everywhere; larger binary). |
| `LlmBackend` | Detect local Ollama instance on `localhost:11434`; if missing, disable AI features. |

---

## 4. Meeting Lifecycle

### State machine

```
[Idle]
  │ user clicks "Start recording" in menubar
  │ OR presses global hotkey (default ⌘⇧M)
  ▼
[SelectingWindow] ── user cancels ──→ [Idle]
  │ user picks Zoom/Meet/Teams window via SCContentSharingPicker
  ▼
[Recording]
  │   ┌─ every 3s ──→ capture frame ──→ sidecar.count_faces ──→
  │   │                if faces > peak.max AND elapsed > 2min
  │   │                  peak.max = faces
  │   │                  capture.png + append event
  │   │
  │   ├─ continuous ──→ system audio → sidecar.transcribe
  │   │
  │   ├─ hotkey ⌘⇧Space ──→ manual capture
  │   │
  │   └─ voice "момент"/"moment" (if enabled) ──→ manual capture
  │
  │ user presses stop OR target window closed for 30s
  ▼
[Finalizing]
  │ stop audio, flush transcript
  │ sidecar.summarize(transcript) → summary.md
  │ sidecar.extract_action_items(transcript) → action-items.json
  │ render index.html (dashboard)
  │ show notification "Meeting saved"
  ▼
[Done] ── open dashboard on click
```

### Key parameters

- **Peak detection cadence:** 3 seconds (balances CPU vs. missed peaks).
- **Peak minimum delay:** 2 minutes into meeting (avoid catching the "host alone" state).
- **Auto-stop condition:** target window closed (and not reopened) for 30 seconds. Silence alone does not stop (natural pauses are expected).
- **Default hotkeys:** ⌘⇧M (start/stop), ⌘⇧Space (manual capture). Customizable.
- **Voice trigger:** opt-in, default OFF. Keywords: "момент" (UA), "moment" (EN).

---

## 5. On-disk Layout

```
~/Moment/
└── 2026-04-17 14-30 Team Sync/          # directory name from window title + start time
    ├── screenshots/
    │   ├── 2026-04-17_14-32-15_peak-5.png
    │   ├── 2026-04-17_14-45-02_manual.png
    │   └── 2026-04-17_14-52-30_voice.png
    ├── audio.m4a                         # system audio, AAC 64kbps
    ├── transcript.srt                    # timestamped, for playback alignment
    ├── transcript.txt                    # plain text
    ├── summary.md                        # Foundation Models output
    ├── action-items.json                 # [{text, assignee?, due?}]
    ├── notes.md                          # user-editable, empty by default
    ├── meeting.json                      # metadata (see below)
    └── index.html                        # self-contained dashboard snapshot
```

### `meeting.json`

```json
{
  "id": "01JR7...",
  "schemaVersion": 1,
  "title": "Team Sync",
  "windowTitle": "Zoom Meeting — Team Sync",
  "platform": "zoom",
  "startedAt": "2026-04-17T14:30:00Z",
  "endedAt": "2026-04-17T15:02:11Z",
  "peakParticipants": 5,
  "peakDetectedAt": "2026-04-17T14:35:22Z",
  "screenshots": [
    { "file": "screenshots/...", "trigger": "peak", "participants": 5, "at": "..." }
  ],
  "events": [
    { "type": "start", "at": "..." },
    { "type": "peak", "count": 5, "at": "..." },
    { "type": "manual_capture", "at": "..." },
    { "type": "end", "at": "..." }
  ],
  "ai": {
    "summaryGenerated": true,
    "actionItemsCount": 3,
    "backend": "foundation-models-1.0",
    "language": "uk"
  }
}
```

An index of all meetings lives in `~/Library/Application Support/Moment/meetings.sqlite` for fast dashboard load.

---

## 6. Swift AI Sidecar — Protocol

Sidecar is a single Swift binary at `Moment.app/Contents/MacOS/moment-ai-sidecar`. Rust spawns it once per Moment session and keeps it alive.

### JSON-lines protocol

Rust → Sidecar (stdin):
```json
{"id": "req-1", "op": "count_faces", "image_path": "/tmp/frame-1234.png"}
{"id": "req-2", "op": "start_transcription", "audio_path": "/tmp/audio-live.wav", "locale": "uk-UA"}
{"id": "req-3", "op": "summarize", "text": "...transcript...", "language": "uk"}
{"id": "req-4", "op": "availability"}
```

Sidecar → Rust (stdout):
```json
{"id": "req-1", "ok": true, "result": {"faces": 5}}
{"id": "req-2", "ok": true, "result": {"stream_id": "s-1"}}
{"id": "req-2", "stream": "s-1", "partial": "Hello everyone..."}
{"id": "req-3", "ok": true, "result": {"summary": "...", "language": "uk"}}
{"id": "req-4", "ok": true, "result": {"llm": "available", "speech": "available", "vision": "available"}}
{"id": "req-X", "ok": false, "error": {"code": "device_not_eligible", "message": "..."}}
```

Errors map to Rust `Availability::Unavailable(Reason)` so the state machine can degrade gracefully.

---

## 7. Permissions

| Permission | Why | When requested |
|---|---|---|
| Screen Recording | ScreenCaptureKit window capture | On first "Start" press |
| Microphone (system audio) | Transcript + silence detection | On first "Start" press |
| Speech Recognition | SFSpeechRecognizer | On first transcription |
| Apple Intelligence | Foundation Models requires user to enable in System Settings | Graceful detection + UI nudge |
| Accessibility | Global hotkeys via tauri-plugin-global-shortcut | On hotkey setup |
| Notifications | Screenshot taken / Meeting saved | First event |

All requested once, cached. Settings panel shows status of each.

---

## 8. Migration of Existing Code

```
moment/
├── legacy/
│   ├── zoom-app/            # former app/ (React Zoom sidebar)
│   └── companion/           # former companion/ (Node CLI)
│   └── README.md            # "Archived 2026-04-17. See docs/superpowers/specs/..."
├── app-tauri/               # Tauri Rust + React (new)
│   ├── src/                 # Rust
│   ├── src-ui/              # React (copied from legacy/zoom-app/src)
│   └── tauri.conf.json
├── sidecar/                 # Swift AI sidecar
│   ├── Package.swift
│   └── Sources/MomentAISidecar/
├── docs/
│   ├── superpowers/specs/   # this file
│   └── user/                # new user-facing docs
├── .github/workflows/
│   ├── build-macos.yml      # notarize-less: self-sign + dmg + releases
│   └── test.yml             # Rust + Swift + Vitest
└── README.md                # rewritten for standalone story
```

Existing deploys (`moment.gtools.space` Cloudflare Pages, Zoom Marketplace listing) are left in place but frozen. The landing page is rewritten to describe the standalone app post-MVP.

---

## 9. Distribution

### Apple Developer account gap

User does not currently have a paid Apple Developer Program membership. That means:
- **No notarization** for MVP.
- DMG is **ad-hoc signed** (`codesign --sign -`).
- Users must right-click → Open on first launch, or run `xattr -d com.apple.quarantine /Applications/Moment.app`.
- Install instructions clearly explain this.

### Channels

| Channel | MVP | Post-MVP |
|---|---|---|
| GitHub Releases (.dmg) | ✅ | ✅ |
| Homebrew Cask (`moment`) | ⏳ | ✅ (offloads notarization to cask maintainers) |
| Mac App Store | ❌ | Requires paid Apple Dev; consider later if user decides to pay $99/year |
| Auto-update | ⏳ | Tauri updater pointed at GitHub Releases JSON manifest |

### Landing page

`moment.gtools.space` stays as a static Cloudflare Pages site. Content rewritten in M6 to emphasize:
- One local app, zero accounts.
- Apple Intelligence-powered transcript + summary.
- Works with any conferencing tool.
- Open source (MIT).

---

## 10. Testing Strategy

| Layer | Tests |
|---|---|
| Rust core | `cargo test` — traits, state machine, storage. Mock backends injected. |
| Platform impls (macOS) | Integration tests spawn sidecar, call each op, assert JSON round-trips. |
| Swift sidecar | XCTest: availability states, face detection on golden images, speech on fixture audio, summary determinism probe. |
| React UI | Vitest + RTL (reuse from legacy/zoom-app/). |
| E2E | Manual checklist documented in `docs/user/manual-test-plan.md`: install → grant permissions → pick window → record short clip → verify dashboard output. |

CI matrix: macOS-14 runner for everything (Rust + Swift + Vitest). Windows/Linux builds produce stub binaries only, no tests, until community contributes.

---

## 11. Open Source Governance

- License: MIT (preserved).
- Repo: `eduftf/moment`.
- `CONTRIBUTING.md`: `cargo fmt`, `cargo clippy --deny warnings`, `swift-format`, ESLint for UI.
- Issue templates: bug, feature, platform-port.
- Platform ports (`CaptureBackend`, `SpeechBackend` for Windows/Linux) flagged `help wanted`.
- No CLA. No paid tier. No telemetry. Privacy policy stays "everything local, nothing leaves your device".

---

## 12. Milestones (rough)

| Milestone | Scope | Est |
|---|---|---|
| M1 | Tauri skeleton + screencapturekit-rs window picker + manual screenshot + file save | 3 days |
| M2 | Swift sidecar with `count_faces` + peak detection loop + auto-capture | 3 days |
| M3 | Audio capture + sidecar `start_transcription` (SFSpeechRecognizer) | 3 days |
| M4 | Sidecar `summarize` + `extract_action_items` (Foundation Models) + availability probe + graceful fallback | 2 days |
| M5 | Dashboard UI (React reuse + new gallery/transcript/summary panes) + SQLite index | 3 days |
| M6 | Ad-hoc signed DMG build, GitHub release workflow, landing page rewrite, README refresh | 2 days |
| M7 | Platform abstraction polish, trait docs, CONTRIBUTING, community onboarding | 1 day |

Total: ~17 working days (≈ 3.5 weeks with Claude Code pairing).

---

## 13. Out of Scope (explicit non-goals for this pivot)

- Windows / Linux native implementations (stub-only; community).
- Mac App Store listing.
- Reaction-event triggers (lost with Zoom SDK dropout; voice + hotkey + peak replace this).
- Chat export (no platform-agnostic way; can be added later via OCR on gallery snapshots).
- Cloud sync, multi-device, accounts, telemetry, payments.
- Foundation Models fine-tuning or custom adapters.
- Real-time collaboration on the dashboard.
- Auto-detection of "meeting started" based on calendar or window heuristics (M1 uses explicit user start).

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Foundation Models unavailable on user's Mac (no M1+, no macOS 26, AI off) | Availability probe on startup; hide AI UI and show nudge. Core features keep working. |
| Ukrainian not supported by Foundation Models / SFSpeechRecognizer | Detect via `supportedLanguages` check on startup; fall back to whisper.cpp (bundled) for UA if needed. Accept M4 delay if whisper fallback needed. |
| ScreenCaptureKit permission friction on first run | Walkthrough screen in onboarding; deep-link to `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`. |
| No Apple Dev account → Gatekeeper friction | Clear install docs; Homebrew Cask as preferred channel once submitted. |
| Swift sidecar crashes break capture | Supervisor in Rust restarts sidecar with exponential backoff; non-AI features continue. |
| Peak detection false positives on gallery-view animations | Require peak to be sustained 2+ frames (6s) before committing capture. |

---

## 15. Decision Log

| Decision | Alternative | Reason |
|---|---|---|
| Tauri (not SwiftUI native) | Pure SwiftUI | Reuse existing React code; cross-platform roadmap; bigger contributor pool. Accepts one extra runtime layer. |
| Swift sidecar (not swift-bridge FFI) | swift-bridge / cxx | Simpler build; cleaner notarization story (future); isolates volatile AI APIs. |
| ScreenCaptureKit via Rust crate | Swift-only capture | Keeps capture loop in Rust core; fewer IPC calls per frame. |
| macOS-first | Cross-platform from day 1 | Solo dev + AI-native pitch; platform abstraction lets community add Windows/Linux later. |
| No Zoom SDK | Keep Zoom sidebar as optional | Maintenance burden + Marketplace dead-end; standalone is clearer product. |
| Self-signed DMG (MVP) | Pay $99 for Apple Dev | User hasn't committed to paid; onboarding docs cover Gatekeeper step. Upgrade path preserved. |
| Voice trigger opt-in | On by default | Privacy; continuous microphone listening should be explicit. |

---

**Next step:** invoke `superpowers:writing-plans` skill to turn this spec into a detailed milestone-by-milestone implementation plan.
