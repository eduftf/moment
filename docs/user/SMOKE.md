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
