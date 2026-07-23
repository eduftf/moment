# Moment — Next Steps

**Last updated:** 2026-07-02 (counts refreshed after overnight fix waves; original M1/M2 snapshot from the 2026-04-23 session)

Point of truth for "what's next after you close this session." Keep ≤ 200 lines.

---

## Immediate (user-gated)

These block further automated work because only the user can perform them.

### 1. M1 + M2 live smoke tests

- [ ] Run `npm run tauri dev` from `~/GFiles/Local/moment/`. Tray icon appears; no panic in log.
- [ ] Follow `docs/user/SMOKE.md` §"Steps" (M1 flow: permission banner, manual capture with ⌘⇧Space, stop with ⌘⇧M, verify `~/Moment/<meeting>/` + `meetings.sqlite`).
- [ ] Follow `docs/user/SMOKE.md` §"M2 — Peak Detection (additive smoke)" (4-person Zoom, 2.5 min warmup, expect `*_peak-4.png`).
- [ ] On pass: `git tag -a m1-closed -m "M1 Capture Foundation complete"` and `git tag -a m2-closed -m "M2 Peak Detection complete"`.

### 2. Swift face-count fixtures

- [ ] Drop `one-face.png` (any single-person headshot, 640×480 recommended) into `sidecar/Tests/MomentAISidecarTests/Fixtures/`.
- [ ] Drop `four-faces.png` (2×2 group photo crop, 640×480) into the same dir.
- [ ] Re-run `cd sidecar && swift test`. Face-count tests should stop skipping (7 pass, 0 skip).

### 3. GitHub push decision

Work now lives on branch `claude/overnight-2026-07-02` — 52 commits ahead of `origin/main` (no push yet; includes the two overnight fix waves below). When ready:

```bash
cd ~/GFiles/Local/moment && git push origin main
```

Not auto-pushed because push is a shared-state action. Session lives on local-only until user sanctions.

---

## Research-ready milestones (automated work can start)

Research reports are committed to `docs/superpowers/research/`. Spec + plan can be drafted autonomously; implementation waits for user go-ahead.

### M3 — Transcript (SFSpeechRecognizer + ScreenCaptureKit audio)

- Research: `docs/superpowers/research/2026-04-24-m3-transcript-research.md`
- Streaming protocol already reserved in M2 (Rust `Envelope::StreamEvent` variant).
- **Key constraints pre-digested:**
  - New `SpeechTranscriber` does NOT support `uk-UA`. Must use legacy `SFSpeechRecognizer` + runtime check `supportsOnDeviceRecognition` + `DictationTranscriber` fallback for UA.
  - Audio capture goes **inside the Swift sidecar** (ScreenCaptureKit already there). Rust only orchestrates lifecycle.
  - Finalization order (to avoid lost final transcript): `removeTap` → `endAudio` → `stop` → await `isFinal`. Gate "Meeting saved" notification on isFinal with 2-3 s timeout fallback.
- Next action: `superpowers:brainstorming` skill to write M3 spec.

### M4 — AI Summary + Action Items (Foundation Models)

- Research: `docs/superpowers/research/2026-04-24-m4-ai-summary-research.md`
- **Key constraints pre-digested:**
  - Foundation Models: 23 locales, **no Ukrainian**. UA meetings → skip summary with `ai.reason = "unsupportedLanguage"`. Do NOT silent-translate.
  - Context window 4,096 tokens total — ~10-min meetings fit one-shot, longer need summarize-of-summaries chunking at ~2,500 tokens/chunk.
  - Action items via `@Generable struct ActionItem { text; assignee?; due? }` + constrained decoding.
  - Timeout budget: 30 s/chunk, 180 s total. Reuses M2 supervisor cancellation.
- Next action: `superpowers:brainstorming` skill to write M4 spec (can be parallel to M3 or after).

### M5 — Interactive Dashboard

- Gallery, transcript viewer, summary, notes, chat export.
- No research yet. Depends on M1+M2+M3+M4 data shapes being stable.

### M6 — Release (DMG + landing refresh)

- Ad-hoc signed DMG via GitHub Actions + GitHub Releases.
- Landing rewrite at `moment.gtools.space` for Tauri standalone story.
- Homebrew Cask submission deferred until M7.

---

## Hygiene (deferred, separate session)

Consciously out of scope for the 2026-04-23 session per spec §3. Requires user judgment on some items:

- `.gitignore` — modified, stage or discard?
- `legacy/zoom-app/public/{privacy,support,terms}.html` — uncommitted edits, remnant of pre-pivot
- Untracked: `GEMINI.md` (purpose?), `docs/assets/`, `docs/zoom-apps-list.png`, `docs/zoom-submission.png`
- Stale: `.wrangler/`, `dist/` (pre-pivot CF Pages artifacts)
- Stale: `docs/plans/` (pre-pivot Zoom-app plans), `docs/zoom-*.md`

All have zero impact on M1+M2 functionality. Tackle in a dedicated "hygiene" session with a grep-and-decide pass.

---

## Session snapshot — M1/M2 (2026-04-23)

- **Commits on `main` (that session):** 29 (`acbc40d` → `f659cd0`)
- **Rust tests:** 24 passed (16 M1 + 5 peak + 1 update_peak + 2 supervisor)
- **Swift tests:** 5 passed + 2 skipped (face fixtures)
- **Typecheck:** clean
- **Live boot verified:** `sidecar ready: state=Ready` → `Moment starting` in log
- **Out of band:** M3 research + M4 research committed as reference docs

## Session snapshot — overnight fix waves (2026-07-02)

- **Branch:** `claude/overnight-2026-07-02` — 52 commits ahead of `origin/main`, not pushed.
- **Frontend tests:** 32 passed (vitest + RTL) across 5 files — `usePermissions`, `useHotkeys`, `PermissionBanner`, `RecentMeetings`, `tauri` API. (Was vacuously passing before wave 1.)
- **Rust tests:** 25 test fns (the 24 above + `concurrent_append_screenshot_records_every_entry` in `storage.rs`, wave 1). Not re-run this session — no Rust toolchain installed on this machine; run `cd src-tauri && cargo test` to confirm.
- **Typecheck:** clean (`npm run typecheck`).
- **Wave 1:** first real vitest+RTL suite; `storage.rs` `meeting.json` read-modify-write serialized behind a mutex.
- **Wave 2:** `usePermissions` poll stale-closure fixed (stops polling once granted, + test); CI workflow steps realigned to the current package.json.

---

## How to resume

From a fresh session started in `~/GFiles/Local/moment/`:

```
Read docs/superpowers/specs/2026-04-17-moment-standalone-design.md
Read NEXT-STEPS.md
```

Then pick a path: smoke (user gate), M3 brainstorm, M4 brainstorm, or hygiene.
