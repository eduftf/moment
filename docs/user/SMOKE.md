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

---

## M2 — Peak Detection (additive smoke)

Run this **in addition to** the M1 flow above once M2 lands. M1 must still pass end-to-end first.

### Steps

1. Run `npm run tauri dev` and grant Screen Recording permission as in §Steps 4-5 of M1.
2. Tail the dev log in another terminal (or check the terminal output). Expect `sidecar ready: state=Ready` within ~5 s of startup. If it says `state=Dead` or `state=Backoff`, the sidecar binary is missing — re-run `scripts/build-sidecar.sh` and restart.
3. Join a 4-person Zoom/Meet/Teams meeting (or have 3 other participants join a 1:1 test meeting). The meeting grid must be visible on screen.
4. In the Moment tray popover, click **Start (first visible window)** and make sure the picked window is the meeting window.
5. Wait **2.5 minutes** (the first 2 minutes are warmup; peak loop no-ops during warmup).
6. Between 2:00 and 3:00 mark, new participants join one at a time until 4 faces are visible for at least 6 consecutive seconds (two `count_faces` samples at 3 s cadence).
7. After the 4-face moment passes, open Finder at `~/Moment/<meeting>/screenshots/` and confirm a file named `YYYY-MM-DD_HH-MM-SS_peak-4.png` exists.
8. Open `~/Moment/<meeting>/meeting.json` and confirm the `screenshots` array contains an entry with `"trigger": "peak"` and the filename from step 7.
9. Run:

```bash
sqlite3 ~/Library/Application\ Support/Moment/meetings.sqlite \
  "SELECT id, title, peak FROM meetings ORDER BY started_at DESC LIMIT 1;"
```

The `peak` column is `4`.

10. Press ⌘⇧M to end the session. Both "Captured …" (manual) and "Meeting saved — N screenshots" (finalize) notifications still work from M1.

### Pass criteria

- `sidecar ready: state=Ready` appears within 5 s of app boot.
- A `*_peak-N.png` exists for the peak reached during the meeting.
- `meeting.json` has a matching peak screenshot entry with `"trigger": "peak"`.
- `meetings.sqlite` `peak` column reflects the peak count.
- No `ERROR` lines from `moment::*` in the dev log.
- The M1 manual/finalize notifications and screenshots still work unchanged.

### Fail handling

Dev-log location: whichever terminal runs `npm run tauri dev`. Redirect to a file for long sessions: `npm run tauri dev > /tmp/moment-tauri-dev.log 2>&1`. Attach to any issue report along with the sidecar stderr (it shows up prefixed `sidecar stderr:` at the `debug` log level — enable with `RUST_LOG=moment=debug npm run tauri dev`).

Common M2 failures:

- **No peak screenshot after 3+ minutes in a 4-face meeting.** Check the dev log for `count_faces failed` or `capture_window failed` warns. If the sidecar is `Backoff`, `scripts/build-sidecar.sh` failed or the binary isn't where `resolve_sidecar_path` expects it.
- **Peak-1.png or peak-2.png saved right after warmup.** The warmup constant is 120 s from `Recording` start. If the meeting had 3 participants visible continuously from minute 2:00, you may see a peak-3 entry. That's intended behaviour (the very first sustained count above the initial max is a peak).
- **Multiple `peak-N.png` files in one session.** Intended — whenever a new sustained max is reached, a new peak captures. Example: 1→2→2 (peak-2) then 3→4→4 (peak-4).
