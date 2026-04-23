# Moment — M1 Close-out Session Design

**Date:** 2026-04-23
**Status:** Approved — ready for implementation plan
**Session goal:** Close milestone M1 "Capture Foundation" to its exit criteria
**Parent spec:** `docs/superpowers/specs/2026-04-17-moment-standalone-design.md`
**Parent plan:** `docs/superpowers/plans/2026-04-17-moment-m1-capture-foundation.md`

---

## 1. Why this doc exists

The M1 plan was written 2026-04-17 and executed through Task 10. The remaining
tasks (T11–T16) plus a modest amount of repository drift need a single, explicit
close-out decision so the next implementation session can execute without
ambiguity. This is a **delta** spec — it does not re-design the app, it fixes
scope for one session.

No architecture changes. No new dependencies beyond what `Cargo.toml` and
`package.json` already declare.

## 2. In-scope (this session)

| | Item | Source |
|---|---|---|
| 1 | **T11** — SQLite meetings index: wire the already-drafted `src-tauri/src/index_db.rs` into `AppHandles`, session lifecycle, and Tauri commands. | M1 plan T11 |
| 2 | **T12** — Global hotkeys: ⌘⇧M (start/stop), ⌘⇧Space (manual capture) via `tauri-plugin-global-shortcut`. | M1 plan T12 |
| 3 | **T13** — Menu-bar icon + native popover: tray icon with recording indicator, popover containing Start/Stop + last-meeting row. | M1 plan T13 (upgraded — see §5) |
| 4 | **T14** — Permission gate: on first start, detect missing Screen Recording permission; surface a banner with "Open System Settings" deep link; disable "Start" until granted. | M1 plan T14 (upgraded — see §5) |
| 5 | **T15** — Notification on capture: `tauri-plugin-notification` toast per screenshot (and per meeting finalize) with the app icon. | M1 plan T15 |
| 6 | **T16** — Smoke-test doc + README rewrite + M1 exit-criteria gating. | M1 plan T16 |
| 7 | **Hygiene** — Rewrite `/moment/CLAUDE.md` to match Tauri pivot; commit missing `LICENSE`. | This session |

## 3. Out-of-scope (explicit non-goals)

- M2 peak detection, M3 audio, M4 AI, M5 dashboard, M6 release, M7 polish.
- Cleaning up `.wrangler/`, `dist/`, and old `docs/plans/` (pre-pivot Zoom plans) and `docs/zoom-*.md` — belongs to a separate hygiene session.
- Resolving uncommitted edits in `legacy/zoom-app/public/{privacy,support,terms}.html` — separate legacy-freeze pass.
- Handling untracked `GEMINI.md`, `docs/assets/`, `docs/zoom-apps-list.png`, `docs/zoom-submission.png` — skip this session; the repo stays with these uncommitted so their origin can be revisited.
- Apple-Developer notarization (MVP ships ad-hoc signed from M6).
- Any UX not strictly needed for "menubar → start → hotkey → capture → stop → meeting folder exists" end-to-end.

## 4. Current state snapshot (ground truth 2026-04-23)

### Already complete (commits `20ec9ff..0429566`)

- Tauri 2 skeleton (`src-tauri/`), React 18 UI (`src/App.tsx`, `src/api/tauri.ts`).
- `src-tauri/src/platform/mod.rs` — `CaptureBackend` trait + error types.
- `src-tauri/src/platform/macos/capture.rs` — `list_windows`, `capture_window` via `screencapturekit` 0.3.
- `src-tauri/src/commands/` — `get_windows`, `granted_permissions`, `open_screen_recording_prefs`, `start_session`, `stop_session`, `session_state`, `capture_manual`.
- `src-tauri/src/session.rs` — state machine (Idle → SelectingWindow → Recording → Finalizing → Done) with atomic transitions and `stop_session` guard.
- `src-tauri/src/storage.rs` — meeting folder + `meeting.json` read/write/finalize.
- `Cargo.toml` dependencies: `rusqlite 0.32 (bundled)`, `directories 5`, `ulid 1`, `chrono 0.4`, `thiserror 2`, `tempfile 3 (dev)` — **all prerequisites for `index_db.rs` already present**.
- `package.json`: `@tauri-apps/plugin-global-shortcut 2.0.1`, `@tauri-apps/plugin-notification 2.0.1` — **all JS prerequisites for hotkeys/notifications already present**.
- `src-tauri/Cargo.toml` → `tauri = { features = ["macos-private-api", "tray-icon"] }` — **tray support compiled in**.
- `lib.rs` already initialises `tauri_plugin_notification` and `tauri_plugin_global_shortcut`.

### Uncommitted draft to integrate

- `src-tauri/src/index_db.rs` — near-complete T11 implementation: `Index` struct with `Mutex<Connection>`, `open_default`, `open(PathBuf)`, `insert_started`, `mark_ended`, `recent(limit)`; `MeetingRow` with `camelCase` serde; 4 unit tests (roundtrip, mark_ended, order-desc, serde-shape). **Not yet declared in `lib.rs`; no Tauri command; not called from `session.rs`.**

### Drift to repair this session

- `/moment/CLAUDE.md` still describes the Zoom App + Companion architecture.
- `LICENSE` is untracked (MIT text present in file, README references it).

### Host platform confirmed

- macOS 26.5 Tahoe, Apple Silicon (arm64), Rust 1.95, Node 25.9, npm 11.12. Above every minimum in the parent spec.

## 5. Design decisions (deltas vs M1 plan)

The M1 plan intentionally left some UX to the implementer. Choices fixed here
for this session:

### 5.1 Tray UX (T13) — native popover, not right-click menu

The plan offered a simple "right-click tray → menu" as the minimum. This
session upgrades to a **left-click popover** because the `tray-icon` feature is
already enabled and Tauri 2 exposes `TrayIconBuilder::on_tray_icon_event`, so
the cost is small and the UX gap is large.

- Tray icon states: `idle` (neutral), `recording` (filled/red dot).
- Popover is a small, non-focus-stealing window: shows session state, "Start" / "Stop" button, and the single most recent meeting (title, started-at) clickable to reveal in Finder.
- Right-click tray still exposes a minimal menu (Open Window, Quit).

### 5.2 Permission gate (T14) — inline banner with CTA

The plan calls for a disabled "Start" button when permission is missing. This
session keeps the disable but **also** renders a top-of-window banner with a
button that deep-links to `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
via the existing `open_screen_recording_prefs` command. Polling `granted_permissions()`
every 2 s while the banner is visible auto-clears it once the user grants the
permission without an app restart.

No full onboarding wizard. No multi-step walkthrough. Banner + CTA only.

### 5.3 Notifications (T15) — per-capture + per-meeting-finalize

Plan: notify on capture. This session also fires a single finalize
notification ("Meeting saved — N screenshots") when a session reaches `Done`.
One extra call site, small polish, meaningful for user trust.

### 5.4 SQLite index (T11) — use the draft as baseline

`index_db.rs` is adopted with minor review adjustments only:

- Add a `update_peak(id, peak)` method (unused in M1 but keeps the API
  symmetric with `meeting.json`; M2 will call it). Ship M1 without calling it.
- Do **not** change the schema or the existing `Mutex<Connection>` wrapping.

### 5.5 CLAUDE.md rewrite — single commit, template-matched

`/moment/CLAUDE.md` rewritten to describe: Tauri 2 + React 18 stack, Rust core
with trait-based platform abstraction, macOS-first with `screencapturekit`
crate, Swift sidecar planned (M2+), on-device Apple Intelligence planned (M4),
local-only storage layout, commands used for dev/test/build, and a reference
to this spec + parent spec.

## 6. Wiring summary (concrete integration points)

This is intentionally specific so the implementation plan can lift directly.

### 6.1 `lib.rs` additions

```rust
pub mod index_db;

pub struct AppHandles {
    pub capture: Arc<dyn CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub index: Arc<index_db::Index>,           // NEW
    pub session: tokio::sync::Mutex<session::SessionState>,
}
```

`run()` constructs `Index::open_default()?` (fall back to in-memory only in
tests — `run()` should surface the error and refuse to boot).

### 6.2 `session.rs` calls

- On `start_session` transition into `Recording`: call `index.insert_started(id, title, path, now)`.
- On `stop_session` transition into `Done`: call `index.mark_ended(id, now)`.
- Both calls behind a single result mapping so a transient SQLite error does not poison the session state.

### 6.3 New Tauri commands

- `get_recent_meetings(limit: u32) -> Vec<MeetingRow>` — thin wrapper over `index.recent()`.
- `register_hotkeys()` — invoked from React on mount; idempotent; uses `tauri-plugin-global-shortcut` to bind ⌘⇧M → `toggle_session`, ⌘⇧Space → `capture_manual`.
- `tray_show_window()` — exposed so the popover's "Open main window" button can focus the main window from the tray process.

### 6.4 React UI additions

- `<PermissionBanner />` — polls `granted_permissions()` every 2 s while visible; renders CTA; hides once granted.
- `<RecentMeetingRow />` — one-row representation of the latest `MeetingRow`, rendered in the tray popover via a second webview window (`tauri.conf.json` entry).
- Hotkey-registration hook in `src/App.tsx` on mount; shows a toast if registration fails (e.g., Accessibility permission missing).

### 6.5 Icons

- Tray icon: reuse `legacy/zoom-app/public/favicon.png` via `sips` + `iconutil` as the M1 plan already describes in Appendix B. Two template variants (`idle`, `recording`) generated into `src-tauri/icons/`.

## 7. Error handling policy

Every new call site surfaces errors through one of three existing paths:

- Rust → UI: `tauri::Result` → UI toast (never silent).
- Hotkey registration: toast + in-banner "Hotkeys disabled — grant Accessibility" message.
- SQLite: error log + toast, but the session still transitions; the meeting folder is the source of truth, the index is a cache. A missing row does not prevent the meeting from existing on disk.
- Permissions: banner with CTA (no toasts — permissions are a persistent state, not a transient event).

No panics on the happy path. Any `unwrap()` introduced this session must be justified by a comment (the only planned one is `conn.lock().unwrap()` inside `Index`, inherited from the draft — acceptable since the mutex is never poisoned by design).

## 8. Testing strategy

- `cargo test` — `index_db` draft ships with 4 unit tests; add 1 more for the `update_peak` method if introduced. Keep the bar at ≥ previous-run green.
- `npm run test:run` — vitest must still pass-with-no-tests (the UI tests live in M5; vitest is present for future use).
- Manual smoke test — **gated on the user**, following `docs/user/SMOKE.md`. Claude cannot drive a live Zoom meeting; the smoke-test file is the contract for the user to execute.

## 9. Exit criteria (unchanged from M1 plan)

- [ ] `cargo test` passes in `src-tauri/`.
- [ ] `npm run test:run` passes at repo root.
- [ ] `docs/user/SMOKE.md` steps 1–9 pass on the developer's Mac.
- [ ] `~/Moment/<meeting>/screenshots/*.png` contains real window pixels.
- [ ] `meetings.sqlite` has a row for the test meeting with `ended_at` set.
- [ ] `legacy/zoom-app/` and `legacy/companion/` unchanged since Task 1.
- [ ] Tauri dev run: no panics, no uncaught promise rejections.

## 10. Implementation approach

Implementation will be driven by `superpowers:writing-plans` → `superpowers:subagent-driven-development` where tasks are independent:

- Parallelisable (independent file sets): T11 wire, T12 hotkeys, T15 notification, CLAUDE.md rewrite, LICENSE commit.
- Serial (shared files or UX dependencies): T13 tray popover (touches `lib.rs` and adds tauri window config), then T14 permission banner (UI integration), finally T16 smoke + README.

The plan will note per-task test commands and the expected git commit message style (conventional commits, as stated in the M1 plan Appendix A).

## 11. Handover checklist to the implementation session

- Session cwd must be `~/Local/moment/` so the project brief loads (HOME-mode brief is inapplicable for in-project edits).
- This spec + parent spec + M1 plan must all be in context at plan-writing time.
- The first implementation commit should be either the `index_db` integration or the CLAUDE.md rewrite — both are low-risk unblockers with no UI dependency.

---

**Next step:** invoke `superpowers:writing-plans` to produce
`docs/superpowers/plans/2026-04-23-moment-m1-closeout.md` with task-by-task
steps, commit boundaries, and verification commands.
