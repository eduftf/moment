# Moment M2 — Peak Detection + Swift Sidecar (Design Spec)

**Date:** 2026-04-23
**Status:** Approved — ready for implementation plan
**Parent spec:** `docs/superpowers/specs/2026-04-17-moment-standalone-design.md`
**Predecessor:** M1 Capture Foundation close-out (2026-04-23, commits `0264e52..9298704`)

---

## 1. Goal

Add automatic "peak participant" screenshot capture during a recording session. A Swift CLI sidecar bundled inside `Moment.app` runs Apple's Vision framework to count faces in a frame; the Rust core periodically samples the active window, asks the sidecar for a face count, and saves a screenshot when a new peak emerges.

This milestone also establishes the **Swift sidecar plumbing** that M3 (transcript) and M4 (AI summary) will reuse. The IPC protocol is deliberately designed for streaming forward-compatibility so M3 can add long-lived transcription sessions without breaking changes.

## 2. In-scope

| | Item |
|---|---|
| 1 | Swift CLI binary `moment-ai-sidecar` built with Swift Package Manager (`Package.swift`, `executableTarget`). |
| 2 | JSON-lines IPC protocol over stdin/stdout with two ops: `count_faces`, `availability`. |
| 3 | Streaming-ready protocol shape (`stream_id` keyspace reserved; M2 does not emit streams but Rust demux handles them correctly). |
| 4 | Rust supervisor that spawns the sidecar once per app session, multiplexes requests by `id`, and restarts on crash with exponential backoff. |
| 5 | Peak-detection loop inside the session state machine: every 3 s, capture a temp frame, query `count_faces`, promote to peak if conditions met. |
| 6 | `VisionBackend` trait implementation that delegates to the sidecar. |
| 7 | Screenshot + event append when a peak fires (`trigger: "peak"` in `meeting.json`). |
| 8 | Ad-hoc codesign of the sidecar binary (no paid Apple Developer account). |
| 9 | Parent spec §4 errata: `VNDetectHumanRectanglesRequest` → `VNDetectFaceRectanglesRequest` (Revision 3). Rationale documented in §9. |

## 3. Out-of-scope

- M3 transcript streaming (`SFSpeechRecognizer`) — reserve protocol keys only, do not implement.
- M4 AI summary (`Foundation Models`) — separate milestone.
- Voice-trigger capture ("момент"/"moment" keyword) — M3 depends on transcript.
- Tuning peak-detection heuristics based on real meetings — M2 ships defaults from parent spec §4.
- Windows/Linux `VisionBackend` impls (ONNX + YOLO-face). Trait slot stays `Unsupported`.
- GitHub Releases workflow changes for shipping sidecar artifacts — M6.
- Sidecar hot-reload or feature flags — YAGNI.
- Dashboard-side visualisation of peak events — M5.

## 4. Architecture

```
┌────────────────── Tauri app (Rust core) ──────────────────┐
│                                                           │
│   Peak loop (3 s tick)                                    │
│     │ if state is Recording:                              │
│     │   capture.capture_frame(window, /tmp/peak.png)      │
│     │   vision.count_faces(frame_path) ──┐               │
│     │                                     │               │
│     └──> Sidecar supervisor ──spawn──┐    │               │
│                                        │    │               │
└────────────────────────────────────────│────┼───────────────┘
                                         │    │ JSON-lines
                                         ▼    ▼
                              moment-ai-sidecar (Swift)
                              - VNDetectFaceRectanglesRequest.Revision3
                              - CVPixelBuffer → VNImageRequestHandler
                              - Foundation Models probe (stub for M4)
```

### 4.1 Processes

- **Tauri app process** — unchanged from M1. Owns the session state machine, storage, index.
- **Sidecar child process** — Swift binary spawned once during `run()` (after `AppHandles` construction). Lives for the life of the app. Restarts on crash.

### 4.2 Trait layering

The existing `VisionBackend` trait from `src-tauri/src/platform/mod.rs` gets its first macOS impl:

```rust
#[async_trait]
pub trait VisionBackend: Send + Sync {
    async fn count_faces(&self, frame_path: &Path) -> PlatformResult<usize>;
    async fn availability(&self) -> VisionAvailability;
}

pub enum VisionAvailability {
    Available,
    Unavailable { reason: String },
}
```

`MacosVision` (new struct) delegates to the sidecar via the supervisor:

```rust
pub struct MacosVision {
    supervisor: Arc<SidecarSupervisor>,
}

#[async_trait]
impl VisionBackend for MacosVision {
    async fn count_faces(&self, frame_path: &Path) -> PlatformResult<usize> {
        let resp = self.supervisor.request(Op::CountFaces { image_path: frame_path.into() }).await?;
        resp.as_face_count()
    }
    // ...
}
```

## 5. Swift sidecar — protocol

### 5.1 Transport

- **stdin**: one JSON object per line, terminated by `\n`. UTF-8.
- **stdout**: one JSON object per line. Both request-response and stream events use the same channel.
- **stderr**: human-readable logs (e.g., `[info] probe: foundation_models=unavailable`). Rust core forwards to `tracing::debug!` tagged `sidecar`.

### 5.2 Request shape

```json
{ "id": "req-<ulid>", "op": "<name>", "args": { ... } }
```

M2 supports two ops:

- `{"op": "availability"}` — returns `{"llm": "unavailable", "speech": "unavailable", "vision": "available"}` (other subsystems land in M3/M4; the key names are **reserved now** so future ops don't need a second round of wiring).
- `{"op": "count_faces", "args": {"image_path": "/tmp/moment-peak.png"}}` — returns `{"faces": N}`.

### 5.3 Response shape

Success:
```json
{ "id": "req-<ulid>", "ok": true, "result": { ... } }
```

Error:
```json
{ "id": "req-<ulid>", "ok": false, "error": { "code": "<kebab-case>", "message": "..." } }
```

Error codes used in M2:
- `image_not_found` — image_path does not exist / unreadable.
- `vision_failed` — `VNImageRequestHandler` threw.
- `unsupported_op` — op not recognised (future-proofing).

### 5.4 Reserved streaming shape (no M2 emission)

The Rust-side demux handles two extra envelope types, **reserved for M3**:

```json
{ "id": "req-<ulid>", "ok": true, "result": { "stream_id": "s-<ulid>" } }    // subscribe acknowledgment
{ "stream_id": "s-<ulid>", "event": "partial", "text": "..." }                 // unsolicited stream message
```

M2 never produces these lines. Rust-side parsing uses a `#[serde(untagged)]` enum so both shapes deserialise cleanly; unknown `event` types log at `debug` and are dropped. This keeps M2 wire-compatible with M3 while costing zero runtime at M2.

### 5.5 Framing discipline

- Both sides flush after every newline. Never batch.
- Lines above 1 MB → sidecar rejects with `oversized_frame`. M2 frames are paths (< 256 B); 1 MB accommodates future base64 batches without DoS risk.

## 6. Rust supervisor

### 6.1 Responsibilities

- Spawn the sidecar once at app boot (after `AppHandles` constructed, before Tauri runs).
- Own the stdin writer behind an `mpsc::Sender<Envelope>`.
- Read stdout in a dedicated task; demux by `id` or `stream_id`.
- Track pending requests in `DashMap<RequestId, oneshot::Sender<Response>>`.
- Restart the sidecar on exit with `exponential-backoff` (100 ms → 30 s, jitter).
- Surface three public states via an `AtomicU8`: `Starting | Ready | Backoff | Dead`.

### 6.2 Public API

```rust
pub struct SidecarSupervisor { /* ... */ }

impl SidecarSupervisor {
    pub async fn spawn(binary_path: PathBuf) -> PlatformResult<Arc<Self>>;
    pub async fn request(&self, op: Op) -> PlatformResult<OpResponse>;
    pub fn state(&self) -> SidecarState;
    pub fn shutdown(&self);
}
```

### 6.3 Binary resolution

Sidecar is bundled via Tauri `externalBin`. At runtime:
- **Dev mode**: `app.path().resolve("moment-ai-sidecar", BaseDirectory::Resource)?` resolves to `src-tauri/target/debug/build/.../moment-ai-sidecar-<triple>`.
- **Built app**: `Moment.app/Contents/MacOS/moment-ai-sidecar`.

Rust uses Tauri's `app.shell().sidecar("moment-ai-sidecar")?.spawn()?` API so the path resolves identically in both modes without custom logic.

### 6.4 Peak-detection behavior on Supervisor backoff/dead

The peak loop reads `supervisor.state()` each tick. If not `Ready`, the tick is skipped (no capture, no error toast — degrades silently). The user can still manually capture via ⌘⇧Space regardless.

## 7. Peak-detection loop

### 7.1 Location

A new `PeakDetector` struct owned by `AppHandles`:

```rust
pub struct PeakDetector {
    vision: Arc<dyn VisionBackend>,
    capture: Arc<dyn CaptureBackend>,
    storage: Arc<Storage>,
}
```

`run()` spawns a `tokio::task` that loops on `session.lock()` and checks state. The task starts at app boot, runs forever, reads state on each tick — no start/stop lifecycle.

### 7.2 Tick logic (pseudo-code)

```
loop {
    sleep(3s)
    if supervisor.state() != Ready: continue
    guard = session.lock().await
    match *guard {
        Recording { meeting_id, window_id, started_at, path, .. } => {
            if (now - started_at) < 2min: continue            // warmup
            let frame_path = /tmp/moment-peak-<pid>.png       // overwrite
            drop(guard)                                        // release before slow I/O
            capture.capture_window(window_id, frame_path).await?
            let faces = vision.count_faces(&frame_path).await?
            peak_state.observe(meeting_id, faces, now)
        }
        _ => continue,
    }
}
```

### 7.3 Peak promotion

In-memory `PeakState` keyed by `meeting_id`:

```rust
struct PeakState {
    max: usize,
    sustain_count: usize,          // consecutive frames at current candidate
    candidate: usize,              // faces seen in previous frame
}
```

Rule:
- `frame_faces > peak_state.max` AND `frame_faces == peak_state.candidate` (i.e., two consecutive frames at the same elevated count) → **promote**: save a screenshot with `trigger: "peak"`, append `Event::Peak { count: frame_faces, at: now }`, update `peak_state.max = frame_faces`, reset `sustain_count`.
- Otherwise: update `candidate = frame_faces`; do not save.

This matches parent spec §4 ("Require peak to be sustained 2+ frames") and the 2-min warmup.

### 7.4 Screenshot storage

Peak screenshots reuse `Storage::append_screenshot` with `trigger: "peak"`. Filename pattern: `YYYY-MM-DD_HH-mm-ss_peak-<N>.png` (per parent spec §5 on-disk layout example).

`meeting.json` events array gets `{"kind": "peak", "count": N, "at": "..."}`.

## 8. On-disk changes

Additive to parent §5:

- `~/Moment/<meeting>/screenshots/..._peak-<N>.png` — new filename suffix for peak-originated screenshots.
- `meeting.json` events: new `"kind": "peak"` variant.
- SQLite `meetings` table — existing `peak INTEGER DEFAULT 0` column updated via a new `Index::update_peak(id, peak)` method (already planned in §5.4 of the M1 close-out spec as a stub; M2 actually calls it).

No schema migration — the `peak` column already exists.

## 9. Design decisions

### 9.1 Vision API correction (errata vs parent spec §4)

Parent spec §4 lists `VNDetectHumanRectanglesRequest`. This was a research-stage guess. Research confirmed `VNDetectFaceRectanglesRequest` + Revision 3 is materially more reliable for grid-view meeting UIs (small faces, head-only framing, occlusion). M2 uses the face-rectangles path and pins `Revision3` explicitly to avoid silent drift across macOS releases.

Action: parent spec remains untouched (it's a historical design doc); M2 spec is the ground truth for Vision choice.

### 9.2 Sidecar lifetime: one-process-per-app

Alternatives considered:
- **One process per request** — eliminated; 100+ ms spawn cost per 3 s tick kills battery and adds log noise.
- **One process per capability (Vision / Speech / LLM)** — eliminated; three supervisors for one user benefit is over-engineering. Single binary stays simple and the three Apple frameworks coexist fine.

### 9.3 Frame handoff via `/tmp` path

Alternatives considered:
- **Base64-in-JSON** — eliminated; ~33% payload bloat plus sidecar must decode to `CGImage` anyway.
- **Named pipe / shared memory** — eliminated; 0.33 Hz cadence does not justify the lifecycle complexity.

M2 writes to `/tmp/moment-peak-<pid>.png` (fixed name, overwrite each tick) so `/tmp` doesn't fragment. APFS keeps it memory-backed while warm.

### 9.4 Rust IPC stack

`tokio::process::Command` + `tokio::io::BufReader` + `tokio::sync::mpsc` + `dashmap::DashMap` + `oneshot::channel` for per-request responses + `tokio::sync::broadcast::channel` for per-stream messages (reserved but active). `exponential-backoff` crate for restart jitter.

### 9.5 Protocol streaming reservation (chosen: yes)

M3 will need long-lived transcription sessions from `SFSpeechRecognizer`. Landing `stream_id` demux infrastructure in M2 is additive, tested against zero-message streams, and avoids a protocol break. Cost: ~100 LOC in supervisor; benefit: M3 writer need only add new `op` names.

### 9.6 Availability probing

`availability` runs at sidecar startup and caches (sidecar holds state). Rust queries it via the supervisor and decides which peak/transcribe/summarize features to light up in UI. Vision probe for M2: load a 1x1 dummy PNG, run the request, catch errors. Speech probe: `SFSpeechRecognizer.supportedLocales().contains("uk-UA") || en-US fallback`. LLM probe: `SystemLanguageModel.default.availability`. M2 only surfaces the Vision result; Speech/LLM are reserved strings for M3/M4.

## 10. Error handling policy

- **Sidecar spawn failed at boot** — log ERROR, peak loop never runs, manual capture works. App must not panic. Settings UI banner: "AI features unavailable" (M5 polish — M2 just logs).
- **Sidecar crashes mid-session** — supervisor restarts with backoff; peak loop ticks no-op during `Backoff`/`Dead` state.
- **`count_faces` times out** — 5 s per-request timeout on Rust side. On timeout → drop the request, log `warn`, skip that tick. Subsequent ticks continue.
- **Vision returns non-zero exit code or `vision_failed`** — log `warn`, skip tick. Meeting recording unaffected.
- **Frame write to `/tmp` fails** — log `warn`, skip tick. Rare; unlikely to recur.
- **Peak screenshot save fails** — log `warn`, event NOT appended (we don't lie about what's on disk), peak state NOT updated (so the next successful tick can retry promotion).

No panics on the happy path or on any sidecar failure mode.

## 11. Testing strategy

### 11.1 Rust side

- Unit: `PeakState::observe` — warmup, single-frame spike (no promote), two-frame sustain (promote), count decrease (no promote, update candidate).
- Unit: protocol envelope `#[serde(untagged)]` parser — request-response, stream-ack, stream-event, error, malformed-line rejection.
- Integration: Supervisor spawn-crash-restart cycle using a fake Swift-free mock sidecar (a 30-line Rust binary that echoes JSON replies; compiled as a dev-dependency test fixture).
- Integration: `MacosVision::count_faces` with mock sidecar → deterministic face counts.

### 11.2 Swift side

- XCTest targets inside the `moment-ai-sidecar` Swift package.
- Fixtures: three 640x480 PNGs — `zero-faces.png`, `one-face.png`, `four-faces.png` (generated from free-use portraits, checked in under `sidecar/Tests/Fixtures/`).
- Tests:
  - `availability` returns `vision: available` on the dev Mac.
  - `count_faces` on the three fixtures returns 0, 1, 4.
  - Unknown op returns `{"ok":false,"error":{"code":"unsupported_op"}}`.
  - Malformed JSON on stdin → error emitted, sidecar stays alive.

### 11.3 Manual smoke

- Extend `docs/user/SMOKE.md` with M2 steps: start recording in a 4-person Zoom call, wait 2.5 min, confirm a `peak-4.png` appears in `screenshots/` and a `{"kind":"peak","count":4}` entry in `meeting.json`.
- The existing M1 smoke steps remain valid.

## 12. Milestones (session granularity)

Rough breakdown for the implementation plan:

| Session task | Scope |
|---|---|
| T1 | Swift package scaffold + `availability` op + unit test |
| T2 | `count_faces` op + fixture PNGs + unit tests |
| T3 | Tauri `externalBin` config + build.rs codesign step + dev-mode sidecar binary discovery |
| T4 | Rust `SidecarSupervisor` (spawn, single-op request, graceful shutdown) |
| T5 | Supervisor restart-with-backoff + state machine (`Starting/Ready/Backoff/Dead`) + tests |
| T6 | Protocol parser (`#[serde(untagged)]`) + stream-message demux infrastructure |
| T7 | `MacosVision` trait impl + `VisionBackend` wired into `AppHandles` |
| T8 | `PeakDetector` task + `PeakState` logic + 2-min warmup + 2-frame sustain |
| T9 | Peak screenshot save + `meeting.json` peak event + `Index::update_peak` wire |
| T10 | SMOKE.md extension + README roadmap bump + M2 exit gate |

Total: ~3 sessions of focused work (~3 parent-spec milestone days).

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vision framework denies access to the temp PNG (sandbox tightening in macOS updates) | M2 is non-sandboxed (no paid Apple Dev). If we ever sandbox, add an entitlements exception for `~/Moment/` and `/tmp/moment-*`. |
| Face-rectangles miscount in dark grid views | M2 accepts this as a known false-negative case; user can still manually capture. M5 dashboard may show "suspected peaks" vs "confirmed peaks" later. |
| Sidecar binary is not found at runtime (dev mode path mismatch) | Use Tauri's `externalBin` + `app.shell().sidecar(name)` API, which resolves identically in dev and built modes. Add a startup log line with the resolved path. |
| Swift-Rust type drift in JSON shapes | Single source of truth: Swift `Request`/`Response` structs have test-generated JSON golden files; Rust tests parse those fixtures. Breaks surface in CI. |
| Peak detection triggers on animations (gallery cycling) | 2-frame sustain already mitigates. If noisy in real meetings, tune sustain to 3 in M2 polish or M3. |
| `/tmp/moment-peak-<pid>.png` leaks if app crashes mid-capture | Files < 5 MB, OS cleans `/tmp` on reboot. Not worth handling. |

## 14. Distribution implications

- Sidecar binary ships inside `Moment.app/Contents/MacOS/moment-ai-sidecar`. No separate release artifact.
- `bundle.externalBin` in `tauri.conf.json` ensures Tauri bundles it automatically.
- Ad-hoc signing via `codesign --force --deep -s - moment-ai-sidecar` before the Tauri bundle step — add to `build.rs` or a `package.json` `pretauri` hook. Because the user has no paid Developer ID, distributed DMG will still trigger Gatekeeper on first launch (documented in M6). On the developer's own Mac, ad-hoc is sufficient.

## 15. Open questions (none blocking)

- **Should the peak event also fire a user-facing notification?** M1 already fires "Captured X" on manual captures. Making peak captures notify too risks notification fatigue during large meetings. **Decision:** silent on peak capture. User sees results in M5 dashboard. Can revisit post-smoke.
- **Should `availability` be re-probed on user request?** E.g., user enables Apple Intelligence mid-session. **Decision:** not in M2. Probe at sidecar spawn only. M4 can add a `refresh_availability` op if needed.

## 16. Exit criteria

- [ ] `cargo test` passes in `src-tauri/` (M1 tests + new peak/protocol/supervisor tests; target ≥ 24 total).
- [ ] `swift test` passes in `sidecar/` with the three fixture PNGs.
- [ ] `npm run test:run` still passes (no UI tests yet; will remain passthrough).
- [ ] `npm run tauri dev` boots the app, supervisor logs `sidecar ready` on stdout.
- [ ] Manual M2 smoke addendum in `docs/user/SMOKE.md`: 4-person Zoom meeting → `peak-4.png` lands in `~/Moment/<meeting>/screenshots/` after warmup.
- [ ] `legacy/` still untouched.
- [ ] No panics, no uncaught promise rejections during 5-minute recorded session.

When all ticks are green, tag `m2-closed` and open M3 spec.

---

**Next step:** invoke `superpowers:writing-plans` to produce
`docs/superpowers/plans/2026-04-23-moment-m2-peak-detection.md` — task-by-task
execution plan with exact Swift and Rust code, commit boundaries, and
verification commands.
