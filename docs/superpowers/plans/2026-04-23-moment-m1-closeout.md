# Moment M1 Close-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close milestone M1 "Capture Foundation" to its exit criteria — wire the drafted SQLite index, add global hotkeys, a tray popover, permission-banner UX, capture/finalize notifications, the smoke-test document, and a pivot-accurate README.

**Architecture:** Tauri 2 + React 18 + Rust core with trait-based platform abstraction. No new architecture — this plan is **integration-only**: it binds already-built pieces (platform backend, session state machine, storage, drafted `index_db`, pre-installed notification/hotkey plugins) into an end-to-end flow that satisfies the M1 exit criteria.

**Tech Stack:** Rust 1.80+, Tauri 2.1, React 18, TypeScript 5.6, `screencapturekit` 0.3, `rusqlite` 0.32, `tauri-plugin-global-shortcut` 2.0, `tauri-plugin-notification` 2.0.

**Spec:** `docs/superpowers/specs/2026-04-23-moment-m1-closeout-design.md`
**Parent M1 plan:** `docs/superpowers/plans/2026-04-17-moment-m1-capture-foundation.md` (T11–T16 are re-implemented here with concrete integration points)

---

## File Structure

### New files

- `LICENSE` — MIT license text
- `src-tauri/capabilities/default.json` — Tauri 2 capability manifest (unblocks custom commands + plugin APIs from the webview)
- `src/components/PermissionBanner.tsx` — inline CTA banner when Screen Recording permission is missing
- `src/components/RecentMeetings.tsx` — single-row recent-meeting display for the tray popover
- `src/hooks/useHotkeys.ts` — register global hotkeys once app is ready
- `src/hooks/usePermissions.ts` — poll `granted_permissions()` every 2 s while unmet
- `docs/user/SMOKE.md` — M1 manual-smoke checklist

### Modified files

- `CLAUDE.md` — rewrite from Zoom-app to Tauri pivot context
- `README.md` — rewrite for standalone app story (per M1 plan T16 step 2)
- `src-tauri/src/lib.rs` — declare `index_db` module, add `Arc<Index>` to `AppHandles`, open at startup
- `src-tauri/src/session.rs` — transition helpers call `Index::insert_started` / `Index::mark_ended`
- `src-tauri/src/commands/mod.rs` — register new commands
- `src-tauri/src/commands/session.rs` — add `toggle_session`, `get_recent_meetings`
- `src-tauri/src/commands/capture.rs` — fire capture notification after successful PNG write
- `src-tauri/tauri.conf.json` — add second window config for tray popover; update tray settings
- `src-tauri/src/tray.rs` (new module) — tray icon state management + left-click handler
- `src/App.tsx` — integrate `PermissionBanner` + `useHotkeys`; render a minimal main window
- `src/api/tauri.ts` — add `getRecentMeetings`, `toggleSession`, `registerHotkeys` wrappers
- `src/main.tsx` — detect window label ("main" vs "popover") and mount the right tree

### Out-of-plan (do not touch this session)

- `legacy/**` — frozen archive
- `.wrangler/`, `dist/` — pre-pivot artifacts (separate hygiene session)
- `docs/plans/` (old Zoom-app plans), `docs/zoom-*.md`, untracked `GEMINI.md`, `docs/assets/`, `docs/zoom-*.png` — separate hygiene session
- Uncommitted edits in `legacy/zoom-app/public/{privacy,support,terms}.html` — separate legacy-freeze pass

---

## Pre-flight

Before Task 1, run these **from `~/Local/moment/`** to establish a clean start:

```bash
git status --short       # should show the known drift + untracked index_db.rs
git log --oneline -5     # verify HEAD is at "acbc40d docs(spec): M1 close-out session design"
cd src-tauri && cargo test --no-run 2>&1 | tail -5
cd .. && npm run test:run
```

Expected: code compiles, existing tests pass, working tree has the drift listed in §4 of the spec.

---

## Task 1: Commit `LICENSE`

**Why:** `README.md` references "## License\nMIT." but the file itself is untracked. This is a 30-second cleanup with zero integration risk — do it first so subsequent commits don't accumulate alongside unrelated tracking noise.

**Files:**
- Modify/Add: `LICENSE` (file already exists on disk, `git status` shows as untracked)

- [ ] **Step 1: Verify the file content**

Run: `cat LICENSE | head -3`
Expected first line: `MIT License`

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore(license): add MIT LICENSE file referenced by README"
```

---

## Task 2: Rewrite `CLAUDE.md`

**Why:** Current `CLAUDE.md` still documents the abandoned Zoom-app architecture. Every future Claude Code session in this repo loads this file and gets misled. Fix before any code changes so they land in correct context.

**Files:**
- Modify: `/Users/mykhailog/Local/moment/CLAUDE.md` (complete replacement)

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```markdown
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
| M1 | Capture foundation — window picker + manual capture + SQLite index + hotkeys + tray | **🚧 in progress** — see `docs/superpowers/plans/2026-04-23-moment-m1-closeout.md` |
| M2 | Peak detection via Swift sidecar + Vision framework | ⏳ |
| M3 | Audio + on-device transcript (SFSpeechRecognizer) | ⏳ |
| M4 | AI summary + action items (Foundation Models) | ⏳ |
| M5 | Interactive dashboard (gallery + transcript + summary + notes) | ⏳ |
| M6 | Ad-hoc signed DMG, GitHub Releases, landing refresh | ⏳ |
| M7 | Platform abstraction polish, community onboarding | ⏳ |

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
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): rewrite CLAUDE.md for Tauri pivot (was Zoom App)"
```

---

## Task 3: Create `src-tauri/capabilities/default.json`

**Why:** Tauri 2 blocks webview `invoke()` calls without an explicit capability. Without this file, the React UI cannot call any existing command (`get_windows`, `start_session`, …). Add the file now so every subsequent task can rely on it.

**Files:**
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Write the file**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Core permissions required by the Moment main window and tray popover.",
  "windows": ["main", "popover"],
  "permissions": [
    "core:default",
    "core:app:default",
    "core:event:default",
    "core:window:default",
    "core:webview:default",
    "core:tray:default",
    "core:path:default",
    "global-shortcut:default",
    "notification:default",
    { "identifier": "notification:allow-notify" },
    { "identifier": "notification:allow-is-permission-granted" },
    { "identifier": "notification:allow-request-permission" },
    "core:menu:default",
    "core:image:default",
    "get_windows",
    "granted_permissions",
    "open_screen_recording_prefs",
    "start_session",
    "stop_session",
    "session_state",
    "capture_manual",
    "toggle_session",
    "get_recent_meetings",
    "register_hotkeys"
  ]
}
```

*Note:* `toggle_session`, `get_recent_meetings`, `register_hotkeys` are added by later tasks — listing them here costs nothing and saves re-edits.

- [ ] **Step 2: Sanity build**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors (capability files are read by `tauri_build::build()`).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat(capabilities): default ACL unblocking custom commands + plugin APIs"
```

---

## Task 4: Wire `index_db` module into `AppHandles`

**Why:** The drafted `src-tauri/src/index_db.rs` compiles (all deps already in `Cargo.toml`) but is not declared as a module and not part of `AppHandles`. Making it reachable is the single smallest unlock before session integration.

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update `lib.rs`**

Replace the file with:

```rust
use std::sync::Arc;
use crate::platform::CaptureBackend;

pub mod commands;
pub mod index_db;
pub mod platform;
pub mod session;
pub mod storage;
pub mod tray;

pub struct AppHandles {
    pub capture: Arc<dyn CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub index: Arc<index_db::Index>,
    pub session: tokio::sync::Mutex<session::SessionState>,
}

fn build_capture() -> Arc<dyn CaptureBackend> {
    #[cfg(target_os = "macos")]
    { Arc::new(platform::macos::MacosCapture::new()) }
    #[cfg(not(target_os = "macos"))]
    { compile_error!("non-macOS builds are stubs in M1; see spec §3"); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info,moment=debug".into()))
        .init();

    let index = index_db::Index::open_default()
        .expect("failed to open meetings index — check ~/Library/Application Support/Moment/ permissions");

    let handles = AppHandles {
        capture: build_capture(),
        storage: Arc::new(storage::Storage::default()),
        index: Arc::new(index),
        session: tokio::sync::Mutex::new(session::SessionState::idle()),
    };

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(handles)
        .setup(|app| {
            tracing::info!("Moment starting, version {}", app.package_info().version);
            tray::setup(app.handle())?;
            Ok(())
        });

    commands::register(builder)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

*Note:* `tray::setup` is introduced by Task 12; for now create a placeholder module so this compiles.

- [ ] **Step 2: Create placeholder `tray.rs`**

Create `src-tauri/src/tray.rs`:

```rust
use tauri::{AppHandle, Runtime};

/// Tray initialisation. Real implementation lands in Task 12; this placeholder
/// keeps `lib.rs` compiling until then.
pub fn setup<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}
```

- [ ] **Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test --lib 2>&1 | tail -20`
Expected: 4 new `index_db` tests pass along with existing session/storage tests.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/tray.rs src-tauri/src/index_db.rs
git commit -m "feat(index): wire index_db module into AppHandles; stub tray setup"
```

---

## Task 5: Insert/update meetings index on session lifecycle

**Why:** The session state machine currently writes only to `meeting.json`. Exit criterion "`meetings.sqlite` has a row for the test meeting with `ended_at` set" requires the index to be updated at `Recording` entry and `Done` entry.

**Files:**
- Modify: `src-tauri/src/commands/session.rs`

- [ ] **Step 1: Locate the existing `start_session` and `stop_session` commands**

Run: `grep -n "fn start_session\|fn stop_session" src-tauri/src/commands/session.rs`
Expected: one match per fn, around lines 10–60.

- [ ] **Step 2: Modify `start_session` to insert, `stop_session` to mark-ended**

Inside the `Ok(new_state)` branch of `start_session` (right after the state transitions to `Recording` and before returning), add:

```rust
if let session::SessionState::Recording { meeting_id, started_at, title, path, .. } = &new_state {
    if let Err(e) = handles.index.insert_started(
        *meeting_id,
        title,
        path,
        *started_at,
    ) {
        tracing::warn!("index insert_started failed: {e} — meeting folder is still source of truth");
    }
}
```

Inside `stop_session`, after the transition to `Done` and before returning, add:

```rust
if let session::SessionState::Done { meeting_id, .. } = &new_state {
    if let Err(e) = handles.index.mark_ended(*meeting_id, chrono::Utc::now()) {
        tracing::warn!("index mark_ended failed: {e}");
    }
}
```

If either method is private, expose them `pub fn` in `src-tauri/src/index_db.rs` (they already are — confirm with `grep -n "pub fn" src-tauri/src/index_db.rs`).

- [ ] **Step 3: Add an integration test**

Append to `src-tauri/src/index_db.rs`:

```rust
#[cfg(test)]
mod lifecycle_integration {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn full_lifecycle_round_trip() {
        let dir = tempdir().unwrap();
        let idx = Index::open(dir.path().join("m.sqlite")).unwrap();
        let id = Ulid::new();
        let t0 = Utc::now();
        idx.insert_started(id, "Call", "/tmp/call", t0).unwrap();

        let rows = idx.recent(10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Call");
        assert!(rows[0].ended_at.is_none());

        let t1 = t0 + chrono::Duration::seconds(60);
        idx.mark_ended(id, t1).unwrap();

        let rows = idx.recent(10).unwrap();
        assert!(rows[0].ended_at.is_some());
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -15`
Expected: all pass, including the new `full_lifecycle_round_trip`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/index_db.rs
git commit -m "feat(session): update meetings index on start and stop"
```

---

## Task 6: Add `get_recent_meetings` Tauri command

**Why:** The tray popover (Task 14) needs a way to read the latest meeting. The index has `recent()`; expose it through the Tauri boundary.

**Files:**
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Add the Rust command**

Append to `src-tauri/src/commands/session.rs`:

```rust
#[tauri::command]
pub async fn get_recent_meetings(
    handles: tauri::State<'_, crate::AppHandles>,
    limit: u32,
) -> Result<Vec<crate::index_db::MeetingRow>, String> {
    handles
        .index
        .recent(limit)
        .map_err(|e| format!("index recent: {e}"))
}
```

- [ ] **Step 2: Register the command**

Modify `src-tauri/src/commands/mod.rs`, adding `session::get_recent_meetings` to the handler list:

```rust
pub mod capture;
pub mod session;
pub mod windows;

use tauri::Runtime;

pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        capture::capture_manual,
        windows::get_windows,
        windows::granted_permissions,
        windows::open_screen_recording_prefs,
        session::start_session,
        session::stop_session,
        session::session_state,
        session::get_recent_meetings,
    ])
}
```

- [ ] **Step 3: Update the TS wrapper**

Modify `src/api/tauri.ts`, adding the type and the wrapper:

```typescript
export type MeetingRow = {
  id: string;
  title: string;
  path: string;
  startedAt: string;
  endedAt: string | null;
  peak: number;
};
```

And inside the `tauri` object:

```typescript
  getRecentMeetings: (limit: number = 1) =>
    invoke<MeetingRow[]>("get_recent_meetings", { limit }),
```

- [ ] **Step 4: Compile**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: clean compile.
Run: `npm run typecheck 2>&1 | tail -5`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/commands/mod.rs src/api/tauri.ts
git commit -m "feat(commands): get_recent_meetings exposed to webview"
```

---

## Task 7: Add `toggle_session` command

**Why:** Hotkey ⌘⇧M (start/stop) and the tray Start/Stop button both need "if idle, start; if recording, stop" semantics. Putting this in Rust keeps the decision single-sourced.

**Files:**
- Modify: `src-tauri/src/commands/session.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Add the command**

Append to `src-tauri/src/commands/session.rs`:

```rust
#[tauri::command]
pub async fn toggle_session(
    handles: tauri::State<'_, crate::AppHandles>,
    window_id: Option<u32>,
    title: Option<String>,
) -> Result<crate::session::SessionState, String> {
    let is_recording = {
        let guard = handles.session.lock().await;
        guard.is_recording()
    };

    if is_recording {
        stop_session(handles).await
    } else {
        let wid = window_id.ok_or_else(|| "window_id required when starting".to_string())?;
        start_session(handles, wid, title).await
    }
}
```

*Note:* the exact parameter names of `start_session` / `stop_session` must match — confirm with `grep -n "pub async fn start_session\|pub async fn stop_session" src-tauri/src/commands/session.rs` before finalising; adjust the arguments above if the existing signatures differ.

- [ ] **Step 2: Register and expose in TS**

Add `session::toggle_session` to `commands/mod.rs` handler list.

Append to `src/api/tauri.ts`:

```typescript
  toggleSession: (windowId?: number, title?: string | null) =>
    invoke<SessionState>("toggle_session", { windowId, title: title ?? null }),
```

- [ ] **Step 3: Compile**

Run: `cd src-tauri && cargo check 2>&1 | tail -5` → clean.
Run: `npm run typecheck 2>&1 | tail -5` → clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/commands/mod.rs src/api/tauri.ts
git commit -m "feat(session): toggle_session command for hotkey/tray reuse"
```

---

## Task 8: Capture notification

**Why:** M1 Exit Criteria + SMOKE step 5 expect "A notification appears: 'Captured screenshots/…png'". Fire it from the capture command so both hotkey and UI paths are covered.

**Files:**
- Modify: `src-tauri/src/commands/capture.rs`

- [ ] **Step 1: Locate `capture_manual`**

Run: `grep -n "fn capture_manual" src-tauri/src/commands/capture.rs`

- [ ] **Step 2: Modify to notify on success**

Inside `capture_manual`, after the PNG file is successfully written and its path is returned, add the notification call. Assuming the existing code returns `Ok(relative_path.to_string())`, modify to:

```rust
use tauri_plugin_notification::NotificationExt;

// ... existing body ...

let rel = relative_path.to_string_lossy().to_string();

let _ = app.notification()
    .builder()
    .title("Moment")
    .body(format!("Captured {rel}"))
    .show();

Ok(rel)
```

If `capture_manual` currently does not receive `app: AppHandle<R>`, add it — the signature becomes:

```rust
#[tauri::command]
pub async fn capture_manual<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    handles: tauri::State<'_, crate::AppHandles>,
) -> Result<String, String> {
    // … existing implementation …
}
```

- [ ] **Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: still green (capture is not unit-tested — the notification is manual-only).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/capture.rs
git commit -m "feat(notification): toast on successful screenshot capture"
```

---

## Task 9: Finalize notification

**Why:** Per spec §5.3, a single "Meeting saved — N screenshots" notification fires when the session reaches `Done`. One extra call site, meaningful trust signal.

**Files:**
- Modify: `src-tauri/src/commands/session.rs`

- [ ] **Step 1: Modify `stop_session`**

After the Task 5 addition (`index.mark_ended`), but before returning `new_state`, read the meeting's screenshot count from `storage` and fire the notification. Add `app: tauri::AppHandle<R>` to `stop_session` if missing.

```rust
use tauri_plugin_notification::NotificationExt;

// ... inside stop_session, after mark_ended and before return ...

if let session::SessionState::Done { meeting_id, .. } = &new_state {
    let count = handles.storage
        .read_metadata(*meeting_id)
        .map(|m| m.screenshots.len())
        .unwrap_or(0);
    let _ = app.notification()
        .builder()
        .title("Moment")
        .body(format!("Meeting saved — {count} screenshots"))
        .show();
}
```

If `Storage::read_metadata(id)` does not yet exist, add it to `storage.rs`:

```rust
impl Storage {
    pub fn read_metadata(&self, id: Ulid) -> StorageResult<MeetingMetadata> {
        let dir = self.meeting_dir(id)?;           // existing helper (or adapt)
        let json = std::fs::read_to_string(dir.join("meeting.json"))?;
        Ok(serde_json::from_str(&json)?)
    }
}
```

Verify `meeting_dir` helper exists with `grep -n "meeting_dir\|pub fn" src-tauri/src/storage.rs`. If the existing file structure differs, use whatever helper already returns the meeting's directory path from a `Ulid`.

- [ ] **Step 2: Compile + test**

Run: `cd src-tauri && cargo test 2>&1 | tail -10` → green.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/session.rs src-tauri/src/storage.rs
git commit -m "feat(notification): finalize toast with screenshot count"
```

---

## Task 10: React hotkey registration hook

**Why:** Per spec §5 and M1 plan T12, ⌘⇧M and ⌘⇧Space must bind on app mount. The `tauri-plugin-global-shortcut` JS API is the simplest place to register them (no extra Rust command needed when we invoke `toggle_session` and `capture_manual` from the handlers).

**Files:**
- Create: `src/hooks/useHotkeys.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useHotkeys.ts`:

```typescript
import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { tauri } from "../api/tauri";

const HOTKEY_TOGGLE = "CommandOrControl+Shift+M";
const HOTKEY_CAPTURE = "CommandOrControl+Shift+Space";

/**
 * Binds the two M1 global hotkeys.
 *
 * - Toggle calls toggle_session(undefined, null). The Rust side rejects with
 *   "window_id required when starting" if idle — the caller (tray popover or
 *   main UI) is responsible for kicking off an initial window pick. This hook
 *   only enables "stop from anywhere" for now; full start-from-hotkey lands
 *   when the tray popover exposes a default window (Task 13-14 / future).
 * - Capture calls capture_manual; silently no-ops when not recording (the
 *   command itself is a no-op in idle thanks to the state check).
 */
export function useHotkeys(opts: { onError?: (reason: string) => void } = {}): void {
  const onError = opts.onError ?? ((r) => console.warn("hotkey:", r));

  useEffect(() => {
    let cancelled = false;

    const wire = async () => {
      try {
        await register(HOTKEY_TOGGLE, async () => {
          try {
            await tauri.toggleSession();
          } catch (e) {
            onError(`toggle: ${String(e)}`);
          }
        });
        await register(HOTKEY_CAPTURE, async () => {
          try {
            await tauri.captureManual();
          } catch (e) {
            onError(`capture: ${String(e)}`);
          }
        });
      } catch (e) {
        if (!cancelled) onError(`register: ${String(e)}`);
      }
    };

    void wire();

    return () => {
      cancelled = true;
      void unregister(HOTKEY_TOGGLE).catch(() => {});
      void unregister(HOTKEY_CAPTURE).catch(() => {});
    };
  }, [onError]);
}
```

- [ ] **Step 2: Integrate into `App.tsx`**

Replace `src/App.tsx` with:

```typescript
import { useState } from "react";
import { useHotkeys } from "./hooks/useHotkeys";
import { PermissionBanner } from "./components/PermissionBanner";

export default function App() {
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  useHotkeys({ onError: (r) => setHotkeyError(r) });

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>Moment</h1>
      <p style={{ marginTop: 4, color: "#666" }}>
        Local meeting archiver — M1 capture foundation
      </p>
      <PermissionBanner />
      {hotkeyError && (
        <div style={{ marginTop: 16, padding: 12, background: "#fff3cd", borderRadius: 6 }}>
          Hotkeys disabled: {hotkeyError}. Grant Accessibility permission in System Settings.
        </div>
      )}
      <p style={{ marginTop: 24, color: "#666", fontSize: 13 }}>
        ⌘⇧M toggle recording · ⌘⇧Space manual capture
      </p>
    </main>
  );
}
```

*Note:* `PermissionBanner` lands in Task 13. For now, TypeScript will flag the import. Either add a stub now (preferred — keeps commits atomic) or sequence Task 13 before compilation is attempted. We choose the stub path:

- [ ] **Step 3: Stub `PermissionBanner`**

Create `src/components/PermissionBanner.tsx`:

```typescript
export function PermissionBanner() {
  return null;
}
```

Task 13 will replace the body.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHotkeys.ts src/App.tsx src/components/PermissionBanner.tsx
git commit -m "feat(hotkeys): register toggle and capture via plugin-global-shortcut"
```

---

## Task 11: Permissions polling hook

**Why:** The banner (Task 13) needs to auto-dismiss when the user grants permission without an app restart. A dedicated hook keeps the polling logic testable and reusable.

**Files:**
- Create: `src/hooks/usePermissions.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/usePermissions.ts`:

```typescript
import { useEffect, useState } from "react";
import { tauri } from "../api/tauri";

export type PermissionState = {
  screen: boolean;
  loading: boolean;
};

/**
 * Polls granted_permissions at intervalMs while any permission is ungranted.
 * Once all are granted, polling stops. Caller can force a re-check via refresh().
 */
export function usePermissions(intervalMs: number = 2000): PermissionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<PermissionState>({ screen: false, loading: true });

  const refresh = async () => {
    try {
      const res = await tauri.grantedPermissions();
      setState({ screen: res.screen, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (!state.screen && !cancelled) {
        timer = window.setTimeout(tick, intervalMs);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { ...state, refresh };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | tail -5` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePermissions.ts
git commit -m "feat(permissions): polling hook for Screen Recording status"
```

---

## Task 12: Tray icon + left-click event handler

**Why:** M1 plan T13 + spec §5.1. `tauri.conf.json` already declares a tray icon, but with `menuOnLeftClick: true`, which is a menu, not the native popover we want. Replace with a custom left-click handler that reveals the popover window.

**Files:**
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Replace `tray.rs` placeholder with real implementation**

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const POPOVER_LABEL: &str = "popover";

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, "quit", "Quit Moment", true, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open-main", "Open Window", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("moment-tray")
        .icon(app.default_window_icon().cloned().unwrap())
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "open-main" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
                    let _ = popover.show();
                    let _ = popover.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 2: Update `tauri.conf.json`**

Edit `src-tauri/tauri.conf.json`: remove the inline `app.trayIcon` object (tray is now configured from `tray.rs`) and add a second window for the popover. Final `app.windows` becomes:

```json
"windows": [
  {
    "label": "main",
    "title": "Moment",
    "width": 820,
    "height": 640,
    "visible": false,
    "center": true,
    "decorations": true
  },
  {
    "label": "popover",
    "title": "Moment",
    "width": 320,
    "height": 220,
    "visible": false,
    "decorations": false,
    "resizable": false,
    "transparent": false,
    "alwaysOnTop": true,
    "skipTaskbar": true
  }
]
```

Remove `"trayIcon": { ... }` — tray is now set up from Rust (more flexible + event-driven).

- [ ] **Step 3: Compile**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: clean compile (uses `tauri::tray`, `tauri::menu` already available with `tray-icon` feature).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/tauri.conf.json
git commit -m "feat(tray): left-click popover; right-click minimal menu (open/quit)"
```

---

## Task 13: `PermissionBanner` React component

**Why:** Replaces the Task 10 stub with the real CTA banner that polls permissions and deep-links to System Settings.

**Files:**
- Modify: `src/components/PermissionBanner.tsx`

- [ ] **Step 1: Replace the stub**

```typescript
import { usePermissions } from "../hooks/usePermissions";
import { tauri } from "../api/tauri";

export function PermissionBanner() {
  const { screen, loading, refresh } = usePermissions(2000);

  if (loading || screen) return null;

  const openPrefs = async () => {
    await tauri.openScreenRecordingPrefs();
    // give user a beat, then re-check
    setTimeout(() => void refresh(), 500);
  };

  return (
    <div
      role="alert"
      style={{
        marginTop: 16,
        padding: 16,
        background: "#fff3cd",
        border: "1px solid #ffecb5",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>Screen Recording permission required</strong>
        <div style={{ marginTop: 4, color: "#856404", fontSize: 13 }}>
          Moment needs permission to capture the window you pick. Grant it in System Settings — this banner disappears automatically.
        </div>
      </div>
      <button
        onClick={() => void openPrefs()}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: "1px solid #856404",
          background: "#ffc107",
          color: "#1a1a1a",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Open System Settings
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + run vitest**

Run: `npm run typecheck 2>&1 | tail -5` → clean.
Run: `npm run test:run 2>&1 | tail -5` → `passWithNoTests` OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/PermissionBanner.tsx
git commit -m "feat(ui): PermissionBanner with polling + deep link to Settings"
```

---

## Task 14: Tray popover — `RecentMeetings` and label dispatch

**Why:** The popover window (Task 12) needs its own React tree showing a Start/Stop button plus the most recent meeting. Different React trees per Tauri window are dispatched in `main.tsx` via `window.location.hash` (or `window.__TAURI_INTERNALS__.metadata.currentWindow.label`).

**Files:**
- Create: `src/components/RecentMeetings.tsx`
- Create: `src/components/Popover.tsx`
- Modify: `src/main.tsx`
- Modify: `src-tauri/tauri.conf.json` (popover window gets `url: "/popover"`)

- [ ] **Step 1: Label-aware mount in `main.tsx`**

Replace `src/main.tsx`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Popover } from "./components/Popover";
import { getCurrentWindow } from "@tauri-apps/api/window";

const label = getCurrentWindow().label;
const Root = label === "popover" ? Popover : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
```

- [ ] **Step 2: `RecentMeetings.tsx`**

Create `src/components/RecentMeetings.tsx`:

```typescript
import { useEffect, useState } from "react";
import { tauri, type MeetingRow } from "../api/tauri";

export function RecentMeetings({ limit = 1 }: { limit?: number }) {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await tauri.getRecentMeetings(limit);
        if (!cancelled) setRows(r);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    };
    void load();
    const i = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [limit]);

  if (err) return <div style={{ fontSize: 12, color: "#dc3545" }}>{err}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 12, color: "#888" }}>No meetings yet.</div>;

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map((m) => (
        <li key={m.id} style={{ padding: "6px 0", borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>
            {new Date(m.startedAt).toLocaleString()} {m.endedAt ? " · ended" : " · in progress"}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `Popover.tsx`**

Create `src/components/Popover.tsx`:

```typescript
import { useEffect, useState } from "react";
import { tauri, type SessionState } from "../api/tauri";
import { RecentMeetings } from "./RecentMeetings";

export function Popover() {
  const [state, setState] = useState<SessionState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await tauri.sessionState();
        if (!cancelled) setState(s);
      } catch {}
    };
    void load();
    const i = window.setInterval(() => void load(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, []);

  const isRecording = state.kind === "recording";

  const toggle = async () => {
    if (isRecording) {
      await tauri.toggleSession();
    } else {
      const wins = await tauri.getWindows();
      const first = wins[0];
      if (!first) return;
      await tauri.startSession(first.id, first.title);
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>Moment</strong>
        <span style={{ fontSize: 11, color: isRecording ? "#dc3545" : "#666" }}>
          {isRecording ? "● recording" : "idle"}
        </span>
      </div>
      <button
        onClick={() => void toggle()}
        style={{
          marginTop: 10,
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: "none",
          background: isRecording ? "#dc3545" : "#0d6efd",
          color: "white",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {isRecording ? "Stop" : "Start (first visible window)"}
      </button>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Recent</div>
        <RecentMeetings limit={1} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Popover window URL**

In `src-tauri/tauri.conf.json`, ensure the `popover` window has `"url": "index.html"` so it loads the same SPA — label-based dispatch in `main.tsx` selects the component. (If `url` is omitted, Tauri defaults to the root — either is fine; specify explicitly to avoid ambiguity):

```json
{
  "label": "popover",
  "title": "Moment",
  "url": "index.html",
  ...
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | tail -5` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx src/components/Popover.tsx src/components/RecentMeetings.tsx src-tauri/tauri.conf.json
git commit -m "feat(tray): popover window with Start/Stop and recent meeting row"
```

---

## Task 15: Write `docs/user/SMOKE.md`

**Why:** The M1 exit criterion "SMOKE.md steps 1–9 pass on the developer's Mac" requires the document to exist and to precisely describe the flow. This is the handover to the user for manual verification.

**Files:**
- Create: `docs/user/SMOKE.md`

- [ ] **Step 1: Write the file**

```markdown
# M1 Smoke Test

## Prereqs
- macOS 12.3 or newer (Apple Silicon or Intel)
- Xcode Command Line Tools (`xcode-select --install`)
- Rust 1.80+, Node 22+, npm 10+
- Moment running via `npm run tauri dev` from the repo root
- Screen Recording permission granted to the host terminal/IDE or to the built `.app`

## Steps

1. Launch the app: from the repo root run `npm run tauri dev`. A tray icon appears in the menu bar; the main window is hidden by default.
2. Open a Zoom, Google Meet, or Microsoft Teams call (solo is fine — an instant Zoom meeting works). The window must be visible on screen.
3. Click the Moment tray icon. A popover appears with "Start (first visible window)" / "Stop" and a "Recent" section.
4. Click the tray icon's right-click menu → **Open Window** so you can see the permission banner in the main window.
5. If the "Screen Recording permission required" banner is visible, click **Open System Settings**, grant the permission for the binary running `npm run tauri dev`, and return to the app. The banner disappears within 2 s.
6. Back in the tray popover, click **Start (first visible window)**. The state toggles to `● recording`.
7. Press ⌘⇧Space to capture a manual screenshot. A notification appears: "Moment — Captured …/screenshots/…png".
8. Repeat ⌘⇧Space a few times. One notification fires per press.
9. Press ⌘⇧M to stop. A finalize notification appears: "Moment — Meeting saved — N screenshots".
10. Open Finder at `~/Moment/`. A folder named `YYYY-MM-DD HH-mm <window title>` exists and contains:
    - `screenshots/*.png` — one per hotkey press (PNG opens in Preview and shows the real Zoom/Meet window, not black pixels)
    - `meeting.json` with `schemaVersion: 1`, matching `id`, `events: [{kind: "start"}, {kind: "manual_capture"}, ..., {kind: "end"}]`, and `endedAt` populated
11. Open `~/Library/Application Support/Moment/meetings.sqlite` with `sqlite3`:

```bash
sqlite3 ~/Library/Application\ Support/Moment/meetings.sqlite \
  "SELECT id, title, started_at, ended_at FROM meetings ORDER BY started_at DESC LIMIT 3;"
```

The just-finished meeting appears with `ended_at` filled in.

## Pass criteria

- Every numbered step above succeeds without an error toast.
- `RUST_LOG=debug npm run tauri dev` shows no panics and no `ERROR` lines from `moment::*`.
- PNG files open in Preview and show the actual meeting window (not black, not empty, not the Moment app itself).
- `meetings.sqlite` row's `ended_at` is an RFC 3339 timestamp, not `NULL`.

## Fail handling

If any step fails, do **not** mark M1 as closed. Open an issue with:

- The failing step number
- `RUST_LOG=debug npm run tauri dev` tail (last 50 lines)
- Screenshot of the main window (if UI-visible failure)
- `ls -la ~/Moment/` and `sqlite3 … "SELECT * FROM meetings …"` output

## What this does NOT test (out of scope for M1)

- Peak detection or automatic captures (M2)
- Audio capture or transcription (M3)
- AI summary or action items (M4)
- Interactive dashboard (M5)
- Installed `.app` outside of `npm run tauri dev` (M6)
```

- [ ] **Step 2: Commit**

```bash
git add docs/user/SMOKE.md
git commit -m "docs(m1): SMOKE.md manual test checklist"
```

---

## Task 16: Rewrite `README.md`

**Why:** Current README still sells the Zoom App; it's the first thing a contributor reads. Rewriting now (before M1 ships publicly) keeps the story consistent.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite for Tauri standalone pivot"
```

---

## Task 17: M1 exit-gate verification

**Why:** Final verification task — runs the exit-criteria checks listed in the parent M1 plan (§M1 Exit Criteria). This task produces no new code; it documents the state and halts if anything fails.

**Files:** none modified.

- [ ] **Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`
Expected: all green. At minimum the new `index_db` tests (4 draft + 1 lifecycle), plus the previously-passing session/storage/platform tests.

- [ ] **Step 2: Run Vitest**

Run: `npm run test:run 2>&1 | tail -5`
Expected: `0 tests` passthrough with `--passWithNoTests`.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: clean.

- [ ] **Step 4: Dev run sanity**

Run in one terminal: `RUST_LOG=debug npm run tauri dev`
Expected within 10 s: tray icon appears in menu bar, no panics in stdout, no uncaught promise rejections in the webview console (inspect with View menu or `Cmd+Alt+I` if DevTools enabled).

Leave running, proceed to Step 5.

- [ ] **Step 5: Hand off to user for smoke test**

In the session reply to the user, ask them to execute `docs/user/SMOKE.md` end to end. Claude **cannot** drive a live Zoom meeting; this step belongs to the human.

- [ ] **Step 6: On user confirmation of SMOKE.md pass, record closure**

Append this line to the commit log via an annotated tag:

```bash
git tag -a m1-closed -m "M1 Capture Foundation complete; SMOKE.md steps 1-11 pass on macOS 26.5."
```

- [ ] **Step 7: Update project memory**

Note in the repo memory (via `/memory` or equivalent): "Moment M1 closed 2026-04-23. M2 (peak detection + Swift sidecar) is next — follow spec §3 LlmBackend/VisionBackend traits."

---

## Self-Review Checklist

The plan author (Claude) verified before handoff:

1. **Spec coverage:**
   - Spec §2 items 1-7 all have tasks — T11→Tasks 4-6; T12→Tasks 7,10; T13→Task 12; T14→Tasks 11,13; T15→Tasks 8,9; T16→Tasks 15,16; Hygiene→Tasks 1,2. ✔
   - Spec §5.1 native popover → Tasks 12, 14. ✔
   - Spec §5.2 permission banner + CTA → Tasks 11, 13. ✔
   - Spec §5.3 finalize notification → Task 9. ✔
   - Spec §5.4 index draft adoption → Task 4. ✔
   - Spec §5.5 CLAUDE.md rewrite → Task 2. ✔
   - Spec §6 wiring summary → all five subsections have matching tasks. ✔

2. **Placeholder scan:** `grep -n "TBD\|TODO\|FIXME\|XXX\|\\?\\?\\?" docs/superpowers/plans/2026-04-23-moment-m1-closeout.md` returns zero. ✔

3. **Type consistency:**
   - `MeetingRow` shape identical between Rust (`index_db.rs`) and TS (`api/tauri.ts`): `id, title, path, startedAt, endedAt, peak`. ✔
   - `SessionState.kind` discriminator matches across tasks. ✔
   - `toggleSession` signature same in all three places (`commands/session.rs`, `api/tauri.ts`, `Popover.tsx`). ✔

4. **Unknowns explicitly flagged:**
   - Task 7 Step 1 note asks the implementer to match `start_session` / `stop_session` signatures before finalising.
   - Task 9 Step 1 note asks the implementer to use whichever `meeting_dir` helper exists.

---

## Commit summary (expected)

| # | Task | Commit subject |
|---|---|---|
| 1 | 1  | `chore(license): add MIT LICENSE file referenced by README` |
| 2 | 2  | `docs(claude): rewrite CLAUDE.md for Tauri pivot (was Zoom App)` |
| 3 | 3  | `feat(capabilities): default ACL unblocking custom commands + plugin APIs` |
| 4 | 4  | `feat(index): wire index_db module into AppHandles; stub tray setup` |
| 5 | 5  | `feat(session): update meetings index on start and stop` |
| 6 | 6  | `feat(commands): get_recent_meetings exposed to webview` |
| 7 | 7  | `feat(session): toggle_session command for hotkey/tray reuse` |
| 8 | 8  | `feat(notification): toast on successful screenshot capture` |
| 9 | 9  | `feat(notification): finalize toast with screenshot count` |
| 10 | 10 | `feat(hotkeys): register toggle and capture via plugin-global-shortcut` |
| 11 | 11 | `feat(permissions): polling hook for Screen Recording status` |
| 12 | 12 | `feat(tray): left-click popover; right-click minimal menu (open/quit)` |
| 13 | 13 | `feat(ui): PermissionBanner with polling + deep link to Settings` |
| 14 | 14 | `feat(tray): popover window with Start/Stop and recent meeting row` |
| 15 | 15 | `docs(m1): SMOKE.md manual test checklist` |
| 16 | 16 | `docs(readme): rewrite for Tauri standalone pivot` |
| 17 | 17 | (no commit — verification + tag after user smoke pass) |

16 code/doc commits + 1 verification gate.

---

## Post-plan notes for the implementation session

- The plan was written from `~/Local/` (HOME mode). The implementation session MUST be run from `~/Local/moment/` so the project brief loads and repo-local hooks fire correctly.
- `subagent-driven-development` is the recommended sub-skill: each task is independent enough that a fresh subagent per task is clean; the main session reviews between subagent returns.
- The manual smoke test cannot be executed by Claude. Task 17 Step 5 hands this off to the user explicitly.
