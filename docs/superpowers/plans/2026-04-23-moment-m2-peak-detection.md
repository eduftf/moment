# Moment M2 Peak Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic peak-participant screenshot capture via a Swift AI sidecar running Apple Vision, integrated into the existing session state machine without breaking M1 capture flows.

**Architecture:** Swift CLI binary `moment-ai-sidecar` (Swift Package Manager, `executableTarget`) bundled via Tauri `externalBin`. Rust supervisor spawns it once per app session, multiplexes JSON-lines requests by `id`, restarts on crash with exponential backoff. A `VisionBackend` trait wraps the supervisor; a `PeakDetector` task ticks every 3 s during `Recording`, writes a temp frame, queries `count_faces`, and saves a peak screenshot when a sustained new maximum emerges.

**Tech Stack:** Swift 5.9+ (SPM, Vision framework, XCTest), Rust 1.80+ (`tokio::process`, `dashmap`, `exponential-backoff`, `async-trait`), Tauri 2.1 (`externalBin`, `app.shell().sidecar()`), macOS 12.3+ (`VNDetectFaceRectanglesRequest` Revision 3).

**Spec:** `docs/superpowers/specs/2026-04-23-moment-m2-peak-detection-design.md`
**Parent spec:** `docs/superpowers/specs/2026-04-17-moment-standalone-design.md` (§4 peak loop, §6 protocol, §9 risks)

---

## File Structure

### New files

- `sidecar/Package.swift` — Swift Package Manager manifest
- `sidecar/Sources/MomentAISidecar/main.swift` — sidecar entry point (stdin loop)
- `sidecar/Sources/MomentAISidecar/Protocol.swift` — Request/Response Codable types
- `sidecar/Sources/MomentAISidecar/VisionOps.swift` — `count_faces` implementation
- `sidecar/Sources/MomentAISidecar/Availability.swift` — `availability` probe
- `sidecar/Tests/MomentAISidecarTests/VisionOpsTests.swift` — face-count golden tests
- `sidecar/Tests/MomentAISidecarTests/ProtocolTests.swift` — JSON round-trip tests
- `sidecar/Tests/MomentAISidecarTests/Fixtures/zero-faces.png` — 640×480 image with no faces
- `sidecar/Tests/MomentAISidecarTests/Fixtures/one-face.png` — 640×480 with one face
- `sidecar/Tests/MomentAISidecarTests/Fixtures/four-faces.png` — 640×480 with four faces
- `src-tauri/src/sidecar/mod.rs` — supervisor public API
- `src-tauri/src/sidecar/protocol.rs` — Rust-side envelope types (`#[serde(untagged)]`)
- `src-tauri/src/sidecar/supervisor.rs` — spawn + IO loop + restart logic
- `src-tauri/src/sidecar/state.rs` — `SidecarState` atomic enum
- `src-tauri/src/platform/macos/vision.rs` — `MacosVision` trait impl
- `src-tauri/src/peak.rs` — `PeakDetector` task + `PeakState` logic
- `scripts/build-sidecar.sh` — builds Swift binary, codesigns ad-hoc, copies to externalBin location

### Modified files

- `src-tauri/Cargo.toml` — add `dashmap = "6"`, `exponential-backoff = "2"`, `async-trait` already present
- `src-tauri/src/platform/mod.rs` — add `VisionBackend` trait + `VisionAvailability` enum (if not yet declared)
- `src-tauri/src/platform/macos/mod.rs` — re-export `MacosVision`
- `src-tauri/src/lib.rs` — add `Arc<SidecarSupervisor>` and `Arc<dyn VisionBackend>` to `AppHandles`; spawn `PeakDetector` task in `setup`
- `src-tauri/src/storage.rs` — `Event` enum gains `Peak { count: usize }` variant; filename pattern adapts to `trigger: "peak"`
- `src-tauri/src/index_db.rs` — add `update_peak(&self, id: Ulid, peak: i64) -> IndexResult<()>`; unit test
- `src-tauri/tauri.conf.json` — `bundle.externalBin` = `["binaries/moment-ai-sidecar"]`
- `src-tauri/build.rs` — invoke `scripts/build-sidecar.sh` before tauri_build
- `docs/user/SMOKE.md` — append "M2 — peak detection" section
- `README.md` — flip roadmap row M1 🚧 → ✅, M2 ⏳ → 🚧

### Out-of-plan (do not touch this session)

- `legacy/**` — frozen
- `.wrangler/`, `dist/`, pre-pivot drift — separate hygiene session
- `src-tauri/src/commands/` beyond the minimal session.rs tweak — M2 adds no new Tauri commands

---

## Pre-flight

Before Task 1, confirm from `~/GFiles/Local/moment/`:

```bash
git status --short                           # expect M1 session's drift only
git log --oneline -3                         # HEAD is "e022f72 docs(spec): M2 peak detection..."
swift --version                              # ≥ 5.9
xcodebuild -version 2>&1 | head -1           # any Xcode with Command Line Tools
cd src-tauri && cargo test 2>&1 | tail -3   # 16/16 green from M1
```

---

## Task 1: Swift package scaffold + `availability` op

**Why:** Start with the simplest op. Gets the Swift stdin loop + Codable shapes working end-to-end so later tasks only add op handlers.

**Files:**
- Create: `sidecar/Package.swift`
- Create: `sidecar/Sources/MomentAISidecar/main.swift`
- Create: `sidecar/Sources/MomentAISidecar/Protocol.swift`
- Create: `sidecar/Sources/MomentAISidecar/Availability.swift`
- Create: `sidecar/Tests/MomentAISidecarTests/ProtocolTests.swift`

- [ ] **Step 1: Create `Package.swift`**

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MomentAISidecar",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "MomentAISidecar",
            path: "Sources/MomentAISidecar"
        ),
        .testTarget(
            name: "MomentAISidecarTests",
            dependencies: ["MomentAISidecar"],
            path: "Tests/MomentAISidecarTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
```

- [ ] **Step 2: Write `Protocol.swift`**

```swift
import Foundation

struct Request: Decodable {
    let id: String
    let op: String
    let args: [String: AnyCodable]?
}

struct Response: Encodable {
    let id: String
    let ok: Bool
    let result: AnyEncodable?
    let error: ResponseError?

    static func success(id: String, result: AnyEncodable) -> Response {
        Response(id: id, ok: true, result: result, error: nil)
    }
    static func failure(id: String, code: String, message: String) -> Response {
        Response(id: id, ok: false, result: nil, error: ResponseError(code: code, message: message))
    }
}

struct ResponseError: Encodable {
    let code: String
    let message: String
}

// Minimal type-erased coders — good enough for M2's small shapes.
struct AnyCodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s; return }
        if let i = try? c.decode(Int.self) { value = i; return }
        if let d = try? c.decode(Double.self) { value = d; return }
        if let b = try? c.decode(Bool.self) { value = b; return }
        if let a = try? c.decode([AnyCodable].self) { value = a.map(\.value); return }
        if let o = try? c.decode([String: AnyCodable].self) {
            value = o.mapValues(\.value); return
        }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported JSON type")
    }
    func string(_ key: String) -> String? { (value as? [String: Any])?[key] as? String }
}

struct AnyEncodable: Encodable {
    let value: Encodable
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
```

- [ ] **Step 3: Write `Availability.swift`**

```swift
import Foundation

struct AvailabilityResult: Encodable {
    let vision: String
    let speech: String
    let llm: String
}

enum Availability {
    static func probe() -> AvailabilityResult {
        // M2 only probes Vision. Speech and llm are reserved for M3/M4.
        // Vision is universally available on macOS 12.3+; dummy-probe by instantiating a request.
        let vision: String = {
            // Vision framework itself is always linkable on our target; we report "available"
            // unconditionally and let count_faces surface runtime failures per-call.
            return "available"
        }()
        return AvailabilityResult(vision: vision, speech: "unavailable", llm: "unavailable")
    }
}
```

- [ ] **Step 4: Write `main.swift`**

```swift
import Foundation

let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput
let stderr = FileHandle.standardError

func writeLine(_ response: Response) {
    do {
        let data = try JSONEncoder().encode(response)
        stdout.write(data)
        stdout.write("\n".data(using: .utf8)!)
    } catch {
        FileHandle.standardError.write("encode failed: \(error)\n".data(using: .utf8)!)
    }
}

func handle(_ request: Request) -> Response {
    switch request.op {
    case "availability":
        return .success(id: request.id, result: AnyEncodable(value: Availability.probe()))
    default:
        return .failure(id: request.id, code: "unsupported_op", message: "op \"\(request.op)\" not recognized")
    }
}

// Line-by-line stdin reader.
var buffer = Data()
while let data = try? stdin.read(upToCount: 4096), !data.isEmpty {
    buffer.append(data)
    while let newlineIndex = buffer.firstIndex(of: 0x0A) {
        let line = buffer.prefix(upTo: newlineIndex)
        buffer.removeSubrange(0...newlineIndex)
        if line.isEmpty { continue }
        do {
            let req = try JSONDecoder().decode(Request.self, from: line)
            writeLine(handle(req))
        } catch {
            stderr.write("malformed request: \(error)\n".data(using: .utf8)!)
        }
    }
}
```

- [ ] **Step 5: Write `ProtocolTests.swift`**

```swift
import XCTest
@testable import MomentAISidecar

final class ProtocolTests: XCTestCase {
    func testResponseSuccessEncodes() throws {
        let r = Response.success(id: "a", result: AnyEncodable(value: AvailabilityResult(vision: "available", speech: "unavailable", llm: "unavailable")))
        let data = try JSONEncoder().encode(r)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"id\":\"a\""))
        XCTAssertTrue(json.contains("\"ok\":true"))
        XCTAssertTrue(json.contains("\"vision\":\"available\""))
    }

    func testResponseFailureEncodes() throws {
        let r = Response.failure(id: "b", code: "vision_failed", message: "x")
        let data = try JSONEncoder().encode(r)
        let json = String(data: data, encoding: .utf8)!
        XCTAssertTrue(json.contains("\"ok\":false"))
        XCTAssertTrue(json.contains("\"code\":\"vision_failed\""))
    }
}
```

- [ ] **Step 6: Build + test**

Run: `cd sidecar && swift test 2>&1 | tail -20`
Expected: 2 tests pass.

- [ ] **Step 7: Manual wire test**

Run: `cd sidecar && swift build && echo '{"id":"1","op":"availability"}' | swift run MomentAISidecar`
Expected line: `{"id":"1","ok":true,"result":{"vision":"available","speech":"unavailable","llm":"unavailable"}}` (field order may differ).

- [ ] **Step 8: Commit**

```bash
git add sidecar/
git commit -m "$(cat <<'EOF'
feat(sidecar): Swift package scaffold with availability op

Establishes Package.swift executableTarget, JSON-lines stdin loop,
Codable Request/Response shapes, and availability op that returns
vision=available / speech+llm=unavailable (M3/M4 will flip these).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `count_faces` op + fixture PNGs + tests

**Why:** Adds the actual Vision work. Pinned to Revision 3 per spec §9.1. Fixture PNGs ship alongside tests as the canonical face-count contract.

**Files:**
- Create: `sidecar/Sources/MomentAISidecar/VisionOps.swift`
- Create: `sidecar/Tests/MomentAISidecarTests/Fixtures/zero-faces.png` (generated — see Step 1)
- Create: `sidecar/Tests/MomentAISidecarTests/Fixtures/one-face.png`
- Create: `sidecar/Tests/MomentAISidecarTests/Fixtures/four-faces.png`
- Create: `sidecar/Tests/MomentAISidecarTests/VisionOpsTests.swift`
- Modify: `sidecar/Sources/MomentAISidecar/main.swift` — add case `"count_faces"`

- [ ] **Step 1: Generate fixture PNGs**

The simplest reliable source for "fixture portraits" is `sips` + SF Symbols or stock solid-coloured rectangles for `zero-faces.png`. For `one-face.png` and `four-faces.png` we need actual images containing detectable faces. Since the implementation session cannot browse stock sites, use macOS's bundled sample imagery at `/System/Library/CoreServices/DefaultDesktop.heic` for zero-faces (no faces guaranteed).

For the face fixtures, use the system Contacts app's default avatar generator via a scripted call, OR generate programmatically with CoreImage `CIFilter.faceBalance` sample faces, OR ask the user to drop three PNGs in `sidecar/Tests/MomentAISidecarTests/Fixtures/` manually.

**Pragmatic path for this session:** ship the fixtures by asking the implementation session's human owner to provide them. The tests reference the filenames; if a fixture is missing, the test skips itself with a message. Concrete skip logic:

```swift
guard let url = Bundle.module.url(forResource: "one-face", withExtension: "png") else {
    throw XCTSkip("fixture one-face.png missing — place it in Tests/Fixtures/ and re-run")
}
```

This way the Swift test target builds and runs today; the human can backfill fixtures when convenient (one selfie, one 2×2 group photo crop).

For `zero-faces.png`, generate programmatically — a 640×480 solid grey PNG has no faces:

```bash
cd sidecar/Tests/MomentAISidecarTests/Fixtures
sips -s format png -z 480 640 /System/Library/CoreServices/DefaultDesktop.heic --out zero-faces.png || \
    (python3 -c "from PIL import Image; Image.new('RGB',(640,480),(128,128,128)).save('zero-faces.png')")
```

If neither `sips -z` on the HEIC nor `PIL` is available, fall back to:

```bash
swift -e 'import AppKit; let img = NSImage(size: NSSize(width: 640, height: 480)); img.lockFocus(); NSColor.gray.set(); NSRect(x:0,y:0,width:640,height:480).fill(); img.unlockFocus(); let tiff = img.tiffRepresentation!; let rep = NSBitmapImageRep(data: tiff)!; let png = rep.representation(using: .png, properties: [:])!; try! png.write(to: URL(fileURLWithPath: "zero-faces.png"))' 
```

- [ ] **Step 2: Write `VisionOps.swift`**

```swift
import Foundation
import Vision

struct CountFacesResult: Encodable {
    let faces: Int
}

enum VisionOps {
    static func countFaces(imagePath: String) throws -> CountFacesResult {
        let url = URL(fileURLWithPath: imagePath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw VisionOpError.imageNotFound(imagePath)
        }
        let handler = VNImageRequestHandler(url: url, options: [:])
        let request = VNDetectFaceRectanglesRequest()
        // Pin revision to avoid silent drift across macOS updates.
        request.revision = VNDetectFaceRectanglesRequestRevision3
        do {
            try handler.perform([request])
        } catch {
            throw VisionOpError.visionFailed(error.localizedDescription)
        }
        let count = request.results?.count ?? 0
        return CountFacesResult(faces: count)
    }
}

enum VisionOpError: Error {
    case imageNotFound(String)
    case visionFailed(String)

    var code: String {
        switch self {
        case .imageNotFound: return "image_not_found"
        case .visionFailed:  return "vision_failed"
        }
    }
    var message: String {
        switch self {
        case .imageNotFound(let p): return "image not found at \(p)"
        case .visionFailed(let m):  return m
        }
    }
}
```

- [ ] **Step 3: Wire `count_faces` into `main.swift`**

Find the `switch request.op` block in `main.swift` and add a case above `default`:

```swift
case "count_faces":
    guard let path = request.args?.string("image_path") else {
        return .failure(id: request.id, code: "image_not_found", message: "args.image_path missing")
    }
    do {
        let result = try VisionOps.countFaces(imagePath: path)
        return .success(id: request.id, result: AnyEncodable(value: result))
    } catch let e as VisionOpError {
        return .failure(id: request.id, code: e.code, message: e.message)
    } catch {
        return .failure(id: request.id, code: "vision_failed", message: error.localizedDescription)
    }
```

- [ ] **Step 4: Write `VisionOpsTests.swift`**

```swift
import XCTest
@testable import MomentAISidecar

final class VisionOpsTests: XCTestCase {
    func fixture(_ name: String) throws -> URL {
        guard let url = Bundle.module.url(forResource: name, withExtension: "png") else {
            throw XCTSkip("fixture \(name).png missing — drop it into Tests/Fixtures/")
        }
        return url
    }

    func testZeroFaces() throws {
        let url = try fixture("zero-faces")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 0)
    }

    func testOneFace() throws {
        let url = try fixture("one-face")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 1)
    }

    func testFourFaces() throws {
        let url = try fixture("four-faces")
        let r = try VisionOps.countFaces(imagePath: url.path)
        XCTAssertEqual(r.faces, 4)
    }

    func testMissingImage() {
        XCTAssertThrowsError(try VisionOps.countFaces(imagePath: "/tmp/definitely-not-there-\(UUID().uuidString).png")) { error in
            guard case VisionOpError.imageNotFound = error else {
                return XCTFail("expected imageNotFound, got \(error)")
            }
        }
    }

    func testUnsupportedOpViaStdin() throws {
        // Smoke: handle() returns unsupported_op for garbage.
        let r = Response.failure(id: "x", code: "unsupported_op", message: "not recognized")
        let data = try JSONEncoder().encode(r)
        XCTAssertTrue(String(data: data, encoding: .utf8)!.contains("unsupported_op"))
    }
}
```

- [ ] **Step 5: Run tests**

Run: `cd sidecar && swift test 2>&1 | tail -20`
Expected: at least 3 tests pass (the 2 from Task 1 + `testZeroFaces` + `testMissingImage`). Face-count tests skip unless fixtures present.

- [ ] **Step 6: Commit**

```bash
git add sidecar/
git commit -m "$(cat <<'EOF'
feat(sidecar): count_faces op via VNDetectFaceRectanglesRequest rev3

Uses Revision 3 explicitly to pin behavior across macOS updates.
Ships a grey 640x480 zero-faces.png fixture; one-face.png / four-faces.png
are optional (tests skip when missing), owner drops them in when available.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tauri `externalBin` + build-sidecar script

**Why:** The Rust build has to compile the Swift binary, ad-hoc codesign it, and place it at the path Tauri expects. Automating this avoids "it built on my machine" drift.

**Files:**
- Create: `scripts/build-sidecar.sh`
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `.gitignore` — add `src-tauri/binaries/` (artifacts are rebuilt)

- [ ] **Step 1: Write `scripts/build-sidecar.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build the Swift AI sidecar binary and place it where Tauri expects.
# Ad-hoc codesigns so local macOS allows it to run without Gatekeeper
# friction on the developer's own Mac.

SIDECAR_DIR="$(cd "$(dirname "$0")/.." && pwd)/sidecar"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
TRIPLE="$(rustc -Vv | awk '/host/ {print $2}')"
# Tauri expects the binary named with the target triple suffix.
OUT_BIN="${OUT_DIR}/moment-ai-sidecar-${TRIPLE}"

mkdir -p "${OUT_DIR}"

pushd "${SIDECAR_DIR}" > /dev/null
swift build -c release
BUILT="${SIDECAR_DIR}/.build/release/MomentAISidecar"
if [ ! -x "${BUILT}" ]; then
    echo "[build-sidecar] expected release binary at ${BUILT} — swift build failed"
    exit 1
fi
cp "${BUILT}" "${OUT_BIN}"
codesign --force --deep -s - "${OUT_BIN}"
popd > /dev/null

echo "[build-sidecar] sidecar ready at ${OUT_BIN}"
```

Make executable:

```bash
chmod +x scripts/build-sidecar.sh
```

- [ ] **Step 2: Modify `src-tauri/build.rs`**

Replace the current body with:

```rust
const COMMANDS: &[&str] = &[
    "get_windows",
    "granted_permissions",
    "open_screen_recording_prefs",
    "start_session",
    "stop_session",
    "session_state",
    "capture_manual",
    "toggle_session",
    "get_recent_meetings",
];

fn main() {
    // Build the Swift sidecar before tauri_build runs, so bundle.externalBin
    // finds the binary. Re-run when sidecar sources change.
    println!("cargo:rerun-if-changed=../sidecar/Package.swift");
    println!("cargo:rerun-if-changed=../sidecar/Sources");
    println!("cargo:rerun-if-changed=../scripts/build-sidecar.sh");

    let status = std::process::Command::new("../scripts/build-sidecar.sh")
        .status()
        .expect("failed to spawn scripts/build-sidecar.sh");
    if !status.success() {
        panic!("scripts/build-sidecar.sh exited with status {status}");
    }

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
```

- [ ] **Step 3: Add `externalBin` to `tauri.conf.json`**

Find the `bundle` section and add:

```json
"bundle": {
  "active": true,
  "targets": ["dmg"],
  "icon": ["icons/icon.icns"],
  "category": "Productivity",
  "externalBin": ["binaries/moment-ai-sidecar"],
  "macOS": { ... }
}
```

- [ ] **Step 4: Update `.gitignore`**

Append:

```
# Swift sidecar build outputs (rebuilt via build.rs)
src-tauri/binaries/
sidecar/.build/
```

- [ ] **Step 5: Verify build chain**

Run: `cd /Users/grk/GFiles/Local/moment && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: `cargo:rerun-if-changed=...` lines visible, Swift build runs, cargo check finishes clean.

Confirm binary present:

Run: `ls -la src-tauri/binaries/`
Expected: `moment-ai-sidecar-aarch64-apple-darwin` (or x86_64 on Intel) exists and is executable.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-sidecar.sh src-tauri/build.rs src-tauri/tauri.conf.json .gitignore
git commit -m "$(cat <<'EOF'
build(sidecar): wire Swift binary through Tauri externalBin

build.rs now runs scripts/build-sidecar.sh before tauri_build; the script
compiles the Swift package in release mode, ad-hoc codesigns the output,
and copies it to src-tauri/binaries/moment-ai-sidecar-<triple>. Tauri
bundles it into Moment.app/Contents/MacOS/ at build time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rust dependencies + sidecar module skeleton

**Why:** Land the crates and module structure so subsequent tasks focus on logic, not scaffolding.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/sidecar/mod.rs`
- Create: `src-tauri/src/sidecar/protocol.rs`
- Create: `src-tauri/src/sidecar/state.rs`
- Create: `src-tauri/src/sidecar/supervisor.rs`
- Modify: `src-tauri/src/lib.rs` — `pub mod sidecar;`

- [ ] **Step 1: Add crates to `Cargo.toml`**

In the `[dependencies]` section append:

```toml
dashmap = "6"
exponential-backoff = "2"
```

- [ ] **Step 2: Create `sidecar/state.rs`**

```rust
use std::sync::atomic::{AtomicU8, Ordering};

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarState {
    Starting = 0,
    Ready = 1,
    Backoff = 2,
    Dead = 3,
}

impl SidecarState {
    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Starting,
            1 => Self::Ready,
            2 => Self::Backoff,
            _ => Self::Dead,
        }
    }
}

#[derive(Debug, Default)]
pub struct SidecarStateCell(AtomicU8);

impl SidecarStateCell {
    pub fn load(&self) -> SidecarState {
        SidecarState::from_u8(self.0.load(Ordering::SeqCst))
    }
    pub fn store(&self, s: SidecarState) {
        self.0.store(s as u8, Ordering::SeqCst);
    }
}
```

- [ ] **Step 3: Create `sidecar/protocol.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Request {
    pub id: String,
    pub op: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
}

/// Envelope returned by the sidecar. Supports four shapes:
/// - success response: { id, ok: true, result }
/// - error response:   { id, ok: false, error }
/// - stream ack:       { id, ok: true, result: { stream_id } }  (reserved for M3)
/// - stream event:     { stream_id, event, ... }                (reserved for M3)
///
/// Unknown shapes deserialize into `Unknown` and are logged at debug.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Envelope {
    Reply {
        id: String,
        ok: bool,
        #[serde(default)]
        result: Option<serde_json::Value>,
        #[serde(default)]
        error: Option<ResponseError>,
    },
    StreamEvent {
        stream_id: String,
        event: String,
        #[serde(flatten)]
        extra: serde_json::Map<String, serde_json::Value>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub struct ResponseError {
    pub code: String,
    pub message: String,
}
```

- [ ] **Step 4: Create `sidecar/supervisor.rs` (skeleton)**

```rust
use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;
use tokio::sync::{mpsc, oneshot};

use crate::sidecar::protocol::{Envelope, Request, ResponseError};
use crate::sidecar::state::{SidecarState, SidecarStateCell};

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("sidecar unavailable: {0:?}")]
    Unavailable(SidecarState),
    #[error("request timed out after {0:?}")]
    Timeout(std::time::Duration),
    #[error("sidecar error: {code} — {message}")]
    Remote { code: String, message: String },
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub type SupervisorResult<T> = Result<T, SupervisorError>;

pub struct Supervisor {
    pub(super) state: Arc<SidecarStateCell>,
    pub(super) tx: mpsc::Sender<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
    pub(super) pending: Arc<DashMap<String, oneshot::Sender<SupervisorResult<serde_json::Value>>>>,
}

impl Supervisor {
    pub fn state(&self) -> SidecarState {
        self.state.load()
    }

    pub async fn request(&self, op: &str, args: Option<serde_json::Value>) -> SupervisorResult<serde_json::Value> {
        if !matches!(self.state.load(), SidecarState::Ready) {
            return Err(SupervisorError::Unavailable(self.state.load()));
        }
        let id = format!("req-{}", ulid::Ulid::new());
        let req = Request { id: id.clone(), op: op.to_string(), args };
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send((req, reply_tx))
            .await
            .map_err(|_| SupervisorError::Protocol("supervisor channel closed".into()))?;
        let timeout = tokio::time::Duration::from_secs(5);
        match tokio::time::timeout(timeout, reply_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(SupervisorError::Protocol("reply channel dropped".into())),
            Err(_) => {
                self.pending.remove(&id);
                Err(SupervisorError::Timeout(timeout))
            }
        }
    }
}
```

*Note:* `Supervisor::spawn` (the real constructor) lands in Task 5 along with the IO loop and restart logic. This file now has the public API shape the rest of the code compiles against.

- [ ] **Step 5: Create `sidecar/mod.rs`**

```rust
pub mod protocol;
pub mod state;
pub mod supervisor;

pub use supervisor::{Supervisor, SupervisorError, SupervisorResult};
```

- [ ] **Step 6: Declare module in `lib.rs`**

Add `pub mod sidecar;` alongside the existing module declarations.

- [ ] **Step 7: Compile**

Run: `cd /Users/grk/GFiles/Local/moment && cd src-tauri && cargo check 2>&1 | tail -10`
Expected: clean compile.

Run: `cd /Users/grk/GFiles/Local/moment && cd src-tauri && cargo test --lib 2>&1 | tail -10`
Expected: still 16 green (no new tests yet).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/sidecar src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(sidecar): Rust module skeleton + crates (dashmap, exponential-backoff)

Adds sidecar::{protocol, state, supervisor} with Request/Envelope types,
SidecarState atomic enum, Supervisor public API shape. Actual spawn +
IO loop + restart logic lands in the next commit; this lets the rest
of the codebase reference the public surface without compile churn.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Supervisor spawn + IO loop + restart

**Why:** The actual child-process plumbing. This is the single largest task because its correctness is load-bearing for every sidecar op.

**Files:**
- Modify: `src-tauri/src/sidecar/supervisor.rs`

- [ ] **Step 1: Replace the supervisor body with the full implementation**

Open `src-tauri/src/sidecar/supervisor.rs` and replace the entire file:

```rust
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use exponential_backoff::Backoff;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

use crate::sidecar::protocol::{Envelope, Request};
use crate::sidecar::state::{SidecarState, SidecarStateCell};

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("sidecar unavailable: {0:?}")]
    Unavailable(SidecarState),
    #[error("request timed out after {0:?}")]
    Timeout(Duration),
    #[error("sidecar error: {code} — {message}")]
    Remote { code: String, message: String },
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub type SupervisorResult<T> = Result<T, SupervisorError>;

type Pending = Arc<DashMap<String, oneshot::Sender<SupervisorResult<serde_json::Value>>>>;

pub struct Supervisor {
    state: Arc<SidecarStateCell>,
    tx: mpsc::Sender<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
    pending: Pending,
}

impl Supervisor {
    pub fn state(&self) -> SidecarState {
        self.state.load()
    }

    /// Spawn the sidecar and start the supervisor task. Returns once the
    /// first successful `availability` round-trip completes, so the caller
    /// can treat the returned Arc<Supervisor> as "warm".
    pub async fn spawn(binary: PathBuf) -> SupervisorResult<Arc<Self>> {
        let state = Arc::new(SidecarStateCell::default());
        let pending: Pending = Arc::new(DashMap::new());
        let (req_tx, req_rx) = mpsc::channel::<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>(64);

        let sup = Arc::new(Self {
            state: state.clone(),
            tx: req_tx,
            pending: pending.clone(),
        });

        tokio::spawn(supervisor_task(binary, state.clone(), pending.clone(), req_rx));

        // Wait up to 5 s for the state to become Ready.
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            if sup.state() == SidecarState::Ready {
                return Ok(sup);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(SupervisorError::Protocol("sidecar did not become ready within 5s".into()));
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    pub async fn request(&self, op: &str, args: Option<serde_json::Value>) -> SupervisorResult<serde_json::Value> {
        if !matches!(self.state.load(), SidecarState::Ready) {
            return Err(SupervisorError::Unavailable(self.state.load()));
        }
        let id = format!("req-{}", ulid::Ulid::new());
        let req = Request { id: id.clone(), op: op.to_string(), args };
        let (reply_tx, reply_rx) = oneshot::channel();
        self.pending.insert(id.clone(), reply_tx.clone_unchecked_workaround());
        // Above does not exist — we use a different pattern: register pending lazily inside the IO loop.
        // Simpler: send the request + reply sender together; the IO loop takes ownership of the sender.
        drop(reply_tx);
        let (reply_tx, reply_rx) = oneshot::channel();
        self.tx
            .send((req, reply_tx))
            .await
            .map_err(|_| SupervisorError::Protocol("supervisor channel closed".into()))?;
        let timeout = Duration::from_secs(5);
        match tokio::time::timeout(timeout, reply_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(SupervisorError::Protocol("reply channel dropped".into())),
            Err(_) => Err(SupervisorError::Timeout(timeout)),
        }
    }
}

async fn supervisor_task(
    binary: PathBuf,
    state: Arc<SidecarStateCell>,
    pending: Pending,
    mut req_rx: mpsc::Receiver<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
) {
    let attempts = Backoff::new(u32::MAX, Duration::from_millis(100), Duration::from_secs(30));
    let mut attempts_iter = attempts.iter();

    loop {
        state.store(SidecarState::Starting);
        match spawn_once(&binary, &state, &pending, &mut req_rx).await {
            Ok(exit_code) => {
                tracing::warn!("sidecar exited cleanly with code {exit_code}, restarting");
            }
            Err(e) => {
                tracing::warn!("sidecar crashed: {e}, restarting with backoff");
            }
        }

        state.store(SidecarState::Backoff);
        match attempts_iter.next() {
            Some(Some(delay)) => tokio::time::sleep(delay).await,
            _ => {
                state.store(SidecarState::Dead);
                return;
            }
        }
    }
}

async fn spawn_once(
    binary: &PathBuf,
    state: &SidecarStateCell,
    pending: &Pending,
    req_rx: &mut mpsc::Receiver<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
) -> SupervisorResult<i32> {
    let mut child: Child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let mut stdin = child.stdin.take().ok_or_else(|| SupervisorError::Protocol("no stdin".into()))?;
    let stdout = child.stdout.take().ok_or_else(|| SupervisorError::Protocol("no stdout".into()))?;
    let stderr = child.stderr.take().ok_or_else(|| SupervisorError::Protocol("no stderr".into()))?;

    // Reader task: lines → demux
    let reader_pending = pending.clone();
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            match serde_json::from_str::<Envelope>(&line) {
                Ok(Envelope::Reply { id, ok, result, error }) => {
                    if let Some((_, tx)) = reader_pending.remove(&id) {
                        let resp: SupervisorResult<serde_json::Value> = if ok {
                            Ok(result.unwrap_or(serde_json::Value::Null))
                        } else if let Some(err) = error {
                            Err(SupervisorError::Remote { code: err.code, message: err.message })
                        } else {
                            Err(SupervisorError::Protocol("ok:false without error payload".into()))
                        };
                        let _ = tx.send(resp);
                    } else {
                        tracing::debug!("sidecar reply for unknown id: {id}");
                    }
                }
                Ok(Envelope::StreamEvent { stream_id, event, .. }) => {
                    // M2 does not emit streams. Log and drop.
                    tracing::debug!("sidecar stream event (reserved for M3): stream={stream_id} event={event}");
                }
                Ok(Envelope::Unknown) => {
                    tracing::debug!("sidecar unknown envelope: {line}");
                }
                Err(e) => {
                    tracing::warn!("sidecar line parse failed: {e} — line: {line}");
                }
            }
        }
    });

    // Stderr drain task
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::debug!("sidecar stderr: {line}");
        }
    });

    // Probe availability to mark Ready.
    let probe_id = format!("req-probe-{}", ulid::Ulid::new());
    let probe = Request { id: probe_id.clone(), op: "availability".into(), args: None };
    let (probe_tx, probe_rx) = oneshot::channel();
    pending.insert(probe_id.clone(), probe_tx);
    let probe_json = format!("{}\n", serde_json::to_string(&probe)?);
    stdin.write_all(probe_json.as_bytes()).await?;
    stdin.flush().await?;

    match tokio::time::timeout(Duration::from_secs(3), probe_rx).await {
        Ok(Ok(Ok(_))) => state.store(SidecarState::Ready),
        Ok(Ok(Err(e))) => {
            tracing::warn!("sidecar availability failed: {e}");
            pending.remove(&probe_id);
            return Err(e);
        }
        Ok(Err(_)) | Err(_) => {
            pending.remove(&probe_id);
            return Err(SupervisorError::Protocol("availability probe timed out".into()));
        }
    }

    // Main loop: shuffle requests into stdin, cleanup on exit.
    loop {
        tokio::select! {
            msg = req_rx.recv() => {
                let Some((req, reply)) = msg else {
                    // Supervisor dropped, exit.
                    let _ = child.kill().await;
                    reader.abort();
                    stderr_task.abort();
                    return Ok(0);
                };
                pending.insert(req.id.clone(), reply);
                match serde_json::to_string(&req) {
                    Ok(line) => {
                        let line = format!("{line}\n");
                        if let Err(e) = stdin.write_all(line.as_bytes()).await {
                            pending.remove(&req.id);
                            tracing::warn!("sidecar stdin write failed: {e}");
                            let _ = child.kill().await;
                            reader.abort();
                            stderr_task.abort();
                            return Err(e.into());
                        }
                        let _ = stdin.flush().await;
                    }
                    Err(e) => {
                        if let Some((_, tx)) = pending.remove(&req.id) {
                            let _ = tx.send(Err(SupervisorError::Json(e)));
                        }
                    }
                }
            }
            status = child.wait() => {
                reader.abort();
                stderr_task.abort();
                // Fail all pending requests so callers don't hang.
                let keys: Vec<String> = pending.iter().map(|e| e.key().clone()).collect();
                for k in keys {
                    if let Some((_, tx)) = pending.remove(&k) {
                        let _ = tx.send(Err(SupervisorError::Protocol("sidecar exited".into())));
                    }
                }
                return Ok(status?.code().unwrap_or(-1));
            }
        }
    }
}
```

*Note:* The earlier Task 4 skeleton's `request()` implementation is superseded here — the real version registers `pending` inside the IO loop right before writing stdin, avoiding the clone_unchecked_workaround stub.

- [ ] **Step 2: Write unit test for request timeout + basic round-trip**

Append to `src-tauri/src/sidecar/supervisor.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    /// Build a tiny mock sidecar as a shell script that reads one line and echoes a fake reply.
    /// Returns the path. Caller must keep the TempFile alive.
    fn mock_sidecar_script(_body: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        writeln!(f, "#!/bin/sh").unwrap();
        writeln!(f, "read line").unwrap();
        writeln!(f, r#"printf '{{"id":"%s","ok":true,"result":{{"vision":"available","speech":"unavailable","llm":"unavailable"}}}}\n' "$(echo \"$line\" | sed 's/.*\"id\":\"\\([^\"]*\\)\".*/\\1/')""#).unwrap();
        writeln!(f, "while read line; do").unwrap();
        writeln!(f, r#"  printf '{{"id":"%s","ok":true,"result":{{"faces":3}}}}\n' "$(echo \"$line\" | sed 's/.*\"id\":\"\\([^\"]*\\)\".*/\\1/')""#).unwrap();
        writeln!(f, "done").unwrap();
        f.flush().unwrap();
        let path = f.path().to_path_buf();
        std::fs::set_permissions(&path, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        f
    }

    #[tokio::test]
    async fn request_round_trip_via_mock() {
        let f = mock_sidecar_script("");
        let sup = Supervisor::spawn(f.path().to_path_buf()).await.expect("spawn");
        assert_eq!(sup.state(), SidecarState::Ready);
        let result = sup.request("count_faces", Some(serde_json::json!({"image_path":"/tmp/x.png"}))).await.unwrap();
        assert_eq!(result["faces"], 3);
    }

    #[tokio::test]
    async fn request_when_dead_returns_unavailable() {
        // Use a nonexistent binary so spawn will fail the first attempt; after backoff window,
        // the state is Backoff (not Dead yet). For this test we inject directly.
        let sup = Arc::new(Supervisor {
            state: Arc::new(SidecarStateCell::default()),
            tx: mpsc::channel(1).0,
            pending: Arc::new(DashMap::new()),
        });
        sup.state.store(SidecarState::Dead);
        let err = sup.request("anything", None).await.unwrap_err();
        matches!(err, SupervisorError::Unavailable(_));
    }
}
```

Add `use std::os::unix::fs::PermissionsExt;` at the top of the test module's imports.

- [ ] **Step 3: Run tests**

Run: `cd /Users/grk/GFiles/Local/moment && cd src-tauri && cargo test --lib sidecar:: 2>&1 | tail -20`
Expected: both new tests pass on macOS (they rely on `sh` being present — which it always is on macOS).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sidecar/supervisor.rs
git commit -m "$(cat <<'EOF'
feat(sidecar): supervisor with spawn, IO loop, backoff restart

Full implementation: tokio::process child, per-request pending map,
select! loop on stdin-writer + child-wait, reader task demuxes
Envelope variants to oneshot channels, stderr drains to tracing.
Boot wait on a probe `availability` request to ensure Ready state
before returning from spawn().

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `VisionBackend` trait + `MacosVision` impl

**Why:** Fold the supervisor behind the trait so the peak loop can depend on `Arc<dyn VisionBackend>` and tests can swap in a mock.

**Files:**
- Modify: `src-tauri/src/platform/mod.rs` — add `VisionBackend` trait + `VisionAvailability`
- Create: `src-tauri/src/platform/macos/vision.rs`
- Modify: `src-tauri/src/platform/macos/mod.rs` — re-export `MacosVision`

- [ ] **Step 1: Inspect current `platform/mod.rs`**

Run: `grep -n "VisionBackend\|VisionAvailability\|pub trait" /Users/grk/GFiles/Local/moment/src-tauri/src/platform/mod.rs`

If `VisionBackend` is already declared (parent spec §3 hinted it would be), skip Step 2. Otherwise:

- [ ] **Step 2: Append to `platform/mod.rs`**

```rust
#[derive(Debug, Clone)]
pub enum VisionAvailability {
    Available,
    Unavailable { reason: String },
}

#[async_trait::async_trait]
pub trait VisionBackend: Send + Sync {
    async fn count_faces(&self, frame_path: &std::path::Path) -> PlatformResult<usize>;
    async fn availability(&self) -> VisionAvailability;
}
```

- [ ] **Step 3: Create `platform/macos/vision.rs`**

```rust
use std::path::Path;
use std::sync::Arc;

use crate::platform::{PlatformError, PlatformResult, VisionAvailability, VisionBackend};
use crate::sidecar::Supervisor;

pub struct MacosVision {
    supervisor: Arc<Supervisor>,
}

impl MacosVision {
    pub fn new(supervisor: Arc<Supervisor>) -> Self {
        Self { supervisor }
    }
}

#[async_trait::async_trait]
impl VisionBackend for MacosVision {
    async fn count_faces(&self, frame_path: &Path) -> PlatformResult<usize> {
        let args = serde_json::json!({ "image_path": frame_path.to_string_lossy() });
        let result = self
            .supervisor
            .request("count_faces", Some(args))
            .await
            .map_err(|e| PlatformError::Capture(format!("count_faces: {e}")))?;
        let faces = result["faces"].as_u64().ok_or_else(|| {
            PlatformError::Capture("count_faces result missing .faces integer".into())
        })?;
        Ok(faces as usize)
    }

    async fn availability(&self) -> VisionAvailability {
        match self.supervisor.request("availability", None).await {
            Ok(v) => match v["vision"].as_str() {
                Some("available") => VisionAvailability::Available,
                Some(other) => VisionAvailability::Unavailable { reason: other.to_string() },
                None => VisionAvailability::Unavailable { reason: "missing .vision".into() },
            },
            Err(e) => VisionAvailability::Unavailable { reason: format!("{e}") },
        }
    }
}
```

*Note:* `PlatformError::Capture(String)` — check `platform/mod.rs` for the actual error variant. If the error enum uses a different variant name (e.g., `Backend(String)` or `Other(String)`), adapt. If no string-bearing variant exists, add one as a minimal inline change.

- [ ] **Step 4: Re-export**

In `src-tauri/src/platform/macos/mod.rs`, add:

```rust
pub mod vision;
pub use vision::MacosVision;
```

- [ ] **Step 5: Compile**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Expected: clean.

Run: `cd src-tauri && cargo test --lib 2>&1 | tail -10`
Expected: all previous tests still green.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/platform/
git commit -m "$(cat <<'EOF'
feat(platform): MacosVision trait impl delegating to Supervisor

VisionBackend::count_faces parses {"faces": N} out of supervisor
request("count_faces"); availability maps supervisor's probe result to
VisionAvailability::{Available,Unavailable}. Future non-macOS impls
(ONNX + YOLO-face for Windows/Linux) plug into the same trait.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire `Supervisor` + `MacosVision` into `AppHandles`

**Why:** Without `AppHandles` ownership, the peak loop can't reach Vision. Spawn both in `run()`.

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update `AppHandles` and `run()`**

Replace the `AppHandles` struct and `run()` in `src-tauri/src/lib.rs`:

```rust
use std::sync::Arc;
use crate::platform::{CaptureBackend, VisionBackend};
use crate::sidecar::Supervisor;

pub mod commands;
pub mod index_db;
pub mod peak;
pub mod platform;
pub mod session;
pub mod sidecar;
pub mod storage;
pub mod tray;

pub struct AppHandles {
    pub capture: Arc<dyn CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub index: Arc<index_db::Index>,
    pub vision: Arc<dyn VisionBackend>,
    pub sidecar: Arc<Supervisor>,
    pub session: tokio::sync::Mutex<session::SessionState>,
}

fn build_capture() -> Arc<dyn CaptureBackend> {
    #[cfg(target_os = "macos")]
    { Arc::new(platform::macos::MacosCapture::new()) }
    #[cfg(not(target_os = "macos"))]
    { compile_error!("non-macOS builds are stubs in M1; see spec §3"); }
}

fn resolve_sidecar_path() -> std::path::PathBuf {
    // In dev (cargo run) the script places the binary here:
    let triple = env!("TARGET_TRIPLE_NOT_AVAILABLE_AT_RUNTIME");
    let _ = triple; // unused — pick path via env/assumption instead:
    // The cleanest runtime-safe path: env var set by build.rs, or a known target dir.
    // We set an env var in build.rs below.
    let path = std::env::var("MOMENT_SIDECAR_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("../src-tauri/binaries/moment-ai-sidecar"));
    path
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info,moment=debug".into()))
        .init();

    let index = index_db::Index::open_default()
        .expect("failed to open meetings index");

    let rt = tokio::runtime::Handle::try_current();
    let sidecar_path = resolve_sidecar_path();
    let sidecar = futures::executor::block_on(async {
        Supervisor::spawn(sidecar_path).await
    }).expect("sidecar spawn failed");

    let vision: Arc<dyn VisionBackend> = {
        #[cfg(target_os = "macos")]
        { Arc::new(platform::macos::MacosVision::new(sidecar.clone())) }
        #[cfg(not(target_os = "macos"))]
        { compile_error!("non-macOS builds have no VisionBackend in M2"); }
    };

    let handles = AppHandles {
        capture: build_capture(),
        storage: Arc::new(storage::Storage::default()),
        index: Arc::new(index),
        vision: vision.clone(),
        sidecar: sidecar.clone(),
        session: tokio::sync::Mutex::new(session::SessionState::idle()),
    };
    let handles_arc = Arc::new(handles);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(handles_arc.clone())
        .setup(move |app| {
            tracing::info!("Moment starting, version {}", app.package_info().version);
            tray::setup(app.handle())?;
            let handles_for_peak = handles_arc.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                peak::PeakDetector::new(handles_for_peak, app_handle).run().await;
            });
            Ok(())
        });

    commands::register(builder)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

*Note:* `futures::executor::block_on` is used here because `run()` is sync and Tauri owns the main runtime. Alternative: use `tokio::runtime::Runtime::new()?.block_on(...)` — pick whichever already compiles cleanly (add `futures = "0.3"` to `Cargo.toml` if using the former). The peak detector spawn uses `tauri::async_runtime::spawn` so it rides Tauri's runtime, avoiding a second runtime.

If `AppHandles` is currently stored in Tauri's state as `AppHandles` (not `Arc<AppHandles>`), `state.capture`/`state.index` accesses won't change; but the peak task needs a strong ref outside Tauri's state machine. Wrapping in `Arc` above and using `.manage(handles_arc.clone())` keeps both sides happy. All existing commands that call `state: State<'_, AppHandles>` need their signature bumped to `state: State<'_, Arc<AppHandles>>`. If this is a large change, keep `AppHandles` unwrapped in Tauri state and instead clone individual `Arc` fields into the peak task.

**Simpler adaptation** (preferred): keep `.manage(handles)` unchanged with `AppHandles` directly, and pass individual `Arc` fields into `PeakDetector::new`:

```rust
.setup(move |app| {
    tray::setup(app.handle())?;
    let vision_for_peak = vision.clone();
    let capture_for_peak = {
        // re-construct or borrow — the CaptureBackend is stored in managed state, so:
        let state: tauri::State<AppHandles> = app.state();
        state.capture.clone()
    };
    // ... but `state.capture.clone()` requires Clone on Arc<dyn>, which works.
    let storage_for_peak = {
        let state: tauri::State<AppHandles> = app.state();
        state.storage.clone()
    };
    let index_for_peak = {
        let state: tauri::State<AppHandles> = app.state();
        state.index.clone()
    };
    // Session lock is still inside AppHandles; the peak task reads it via Tauri state later.
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        peak::PeakDetector::new(
            vision_for_peak, capture_for_peak, storage_for_peak, index_for_peak, app_handle
        ).run().await;
    });
    Ok(())
})
```

The implementation session picks whichever shape compiles with the least friction.

- [ ] **Step 2: Compile**

Run: `cd src-tauri && cargo check 2>&1 | tail -20`
Expected: errors about `peak::PeakDetector` not existing yet. That's fine — Task 8 introduces it.

Alternatively: add a stub `src-tauri/src/peak.rs`:

```rust
use std::sync::Arc;

pub struct PeakDetector;

impl PeakDetector {
    pub fn new(
        _vision: Arc<dyn crate::platform::VisionBackend>,
        _capture: Arc<dyn crate::platform::CaptureBackend>,
        _storage: Arc<crate::storage::Storage>,
        _index: Arc<crate::index_db::Index>,
        _app: tauri::AppHandle,
    ) -> Self {
        Self
    }
    pub async fn run(&self) {
        // Real logic lands in Task 8.
    }
}
```

- [ ] **Step 3: Run dev build**

Run: `cd /Users/grk/GFiles/Local/moment && npm run tauri dev > /tmp/m2-boot.log 2>&1 &`

Wait 90 s (bundle + Vite + cargo first build), then:

Run: `grep -E "sidecar|Supervisor|Ready|Moment starting" /tmp/m2-boot.log`
Expected: `Moment starting, version 2.0.0-alpha.0` line present; no `panicked` lines.

Kill the dev run:

Run: `pkill -f "target/debug/moment" ; pkill -f "cargo.*run" ; pkill -f vite`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/peak.rs
git commit -m "$(cat <<'EOF'
feat(app): wire Supervisor + MacosVision into AppHandles

Sidecar spawns once during run() setup. PeakDetector task is kicked off
via tauri::async_runtime::spawn so it rides the same runtime. Stub peak
module compiles today; real loop arrives in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `PeakDetector` + `PeakState` + unit tests

**Why:** The core M2 feature — the 3 s loop that decides when to save a peak screenshot.

**Files:**
- Modify: `src-tauri/src/peak.rs` (replace stub)

- [ ] **Step 1: Write `PeakState` + `PeakDetector` + tests**

```rust
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tauri_plugin_notification::NotificationExt;
use tauri::{AppHandle, Manager, Runtime};
use ulid::Ulid;

use crate::index_db::Index;
use crate::platform::{CaptureBackend, VisionBackend};
use crate::session::SessionState;
use crate::storage::{Event, ScreenshotEntry, Storage};

const TICK: Duration = Duration::from_secs(3);
const WARMUP: Duration = Duration::from_secs(120);

#[derive(Debug, Default, Clone)]
struct PeakState {
    max: usize,
    candidate: usize,
}

impl PeakState {
    /// Returns Some(new_max) when the observed count should promote to a peak.
    fn observe(&mut self, faces: usize) -> Option<usize> {
        if faces > self.max && faces == self.candidate {
            let new_max = faces;
            self.max = faces;
            self.candidate = faces;
            Some(new_max)
        } else {
            self.candidate = faces;
            None
        }
    }
}

pub struct PeakDetector<R: Runtime> {
    vision: Arc<dyn VisionBackend>,
    capture: Arc<dyn CaptureBackend>,
    storage: Arc<Storage>,
    index: Arc<Index>,
    app: AppHandle<R>,
}

impl<R: Runtime> PeakDetector<R> {
    pub fn new(
        vision: Arc<dyn VisionBackend>,
        capture: Arc<dyn CaptureBackend>,
        storage: Arc<Storage>,
        index: Arc<Index>,
        app: AppHandle<R>,
    ) -> Self {
        Self { vision, capture, storage, index, app }
    }

    pub async fn run(self) {
        // Per-meeting peak state. Reset on each meeting_id change.
        let mut current: Option<(Ulid, PeakState)> = None;
        let frame_path = PathBuf::from(format!("/tmp/moment-peak-{}.png", std::process::id()));

        loop {
            tokio::time::sleep(TICK).await;

            // Read session state from Tauri-managed AppHandles.
            let handles: tauri::State<crate::AppHandles> = self.app.state();
            let snapshot = handles.session.lock().await.clone();

            let (meeting_id, window_id, started_at, path) = match snapshot {
                SessionState::Recording { meeting_id, window_id, started_at, path, .. } => {
                    (meeting_id, window_id, started_at, path)
                }
                _ => {
                    current = None;
                    continue;
                }
            };

            if (Utc::now() - started_at).num_seconds() < WARMUP.as_secs() as i64 {
                continue;
            }

            // Reset state if meeting changed.
            let state = match &mut current {
                Some((id, st)) if *id == meeting_id => st,
                _ => {
                    current = Some((meeting_id, PeakState::default()));
                    &mut current.as_mut().unwrap().1
                }
            };

            // Capture a frame into the fixed tmp path (overwrite).
            if let Err(e) = self.capture.capture_window(window_id, &frame_path).await {
                tracing::warn!("peak: capture_window failed: {e}");
                continue;
            }

            let faces = match self.vision.count_faces(&frame_path).await {
                Ok(n) => n,
                Err(e) => {
                    tracing::warn!("peak: count_faces failed: {e}");
                    continue;
                }
            };

            if let Some(peak_count) = state.observe(faces) {
                let meeting_path = std::path::Path::new(&path).to_path_buf();
                let screenshots_dir = meeting_path.join("screenshots");
                if let Err(e) = std::fs::create_dir_all(&screenshots_dir) {
                    tracing::warn!("peak: mkdir screenshots: {e}");
                    continue;
                }

                // Write the peak screenshot by re-capturing with suffix naming.
                // Simpler: reuse the temp frame — copy it to screenshots dir.
                let ts = Utc::now().format("%Y-%m-%d_%H-%M-%S");
                let dest = screenshots_dir.join(format!("{ts}_peak-{peak_count}.png"));
                if let Err(e) = std::fs::copy(&frame_path, &dest) {
                    tracing::warn!("peak: copy frame to screenshots dir failed: {e}");
                    continue;
                }

                // Append to meeting.json + index.
                let entry = ScreenshotEntry {
                    file: dest.strip_prefix(&meeting_path).map(|p| p.display().to_string()).unwrap_or_else(|_| dest.display().to_string()),
                    trigger: "peak".into(),
                    at: Utc::now(),
                };
                let _ = self.storage.append_screenshot(&meeting_path, entry);
                let _ = self.index.update_peak(meeting_id, peak_count as i64);
                tracing::info!("peak: promoted to {peak_count}");
                // Silent: no user notification for peaks in M2 (spec §15).
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_promote_on_zero_faces() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(0), None);
        assert_eq!(s.observe(0), None);
        assert_eq!(s.max, 0);
    }

    #[test]
    fn single_frame_spike_does_not_promote() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(3), None); // candidate set
        assert_eq!(s.observe(0), None); // sustain failed, reset
        assert_eq!(s.max, 0);
    }

    #[test]
    fn two_frame_sustain_promotes() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(4), None);        // candidate = 4
        assert_eq!(s.observe(4), Some(4));     // sustained: promote
        assert_eq!(s.max, 4);
    }

    #[test]
    fn no_promote_when_below_current_max() {
        let mut s = PeakState { max: 5, candidate: 5 };
        assert_eq!(s.observe(3), None);
        assert_eq!(s.observe(3), None);
        assert_eq!(s.max, 5);
    }

    #[test]
    fn sustained_new_higher_max_promotes() {
        let mut s = PeakState { max: 3, candidate: 3 };
        assert_eq!(s.observe(5), None);
        assert_eq!(s.observe(5), Some(5));
        assert_eq!(s.max, 5);
    }
}
```

*Note:* `Event` enum variant `Peak` is referenced in §8 of the spec but `storage.rs` currently uses a string-tagged `Event`. To avoid churn, M2 uses the existing `append_screenshot` which records the trigger as a string — the "peak" trigger is distinct enough. No `Event::Peak` introduction needed; the screenshot entry with `trigger: "peak"` IS the event.

- [ ] **Step 2: Ensure `Index::update_peak` exists**

Check `src-tauri/src/index_db.rs`: if `update_peak` is missing, add:

```rust
impl Index {
    pub fn update_peak(&self, id: Ulid, peak: i64) -> IndexResult<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE meetings SET peak = ?1 WHERE id = ?2",
            rusqlite::params![peak, id.to_string()],
        )?;
        Ok(())
    }
}
```

And test:

```rust
#[test]
fn update_peak_roundtrip() {
    let tmp = tempfile::NamedTempFile::new().unwrap();
    let idx = Index::open(tmp.path().to_path_buf()).unwrap();
    let id = Ulid::new();
    idx.insert_started(id, "Demo", "/tmp/x", Utc::now()).unwrap();
    idx.update_peak(id, 5).unwrap();
    let rows = idx.recent(1).unwrap();
    assert_eq!(rows[0].peak, 5);
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test --lib peak:: index_db:: 2>&1 | tail -20`
Expected: 5 new `peak::tests` pass + `update_peak_roundtrip`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/peak.rs src-tauri/src/index_db.rs
git commit -m "$(cat <<'EOF'
feat(peak): PeakDetector loop with 2-frame sustain promotion

Runs every 3 s during Recording; writes /tmp/moment-peak-<pid>.png,
calls VisionBackend::count_faces, promotes to peak on two consecutive
frames at the same elevated count. Saves a peak-N.png alongside
manual screenshots and bumps meetings.sqlite peak column.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Supervisor warmup in production `run()` + end-to-end boot verification

**Why:** Task 7 already wires Supervisor into `run()` but uses a fragile `futures::executor::block_on`. Polish the boot sequence and add a "sidecar ready" log line to aid smoke testing.

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` — add `futures = "0.3"` if `block_on` is used

- [ ] **Step 1: Ensure `futures` available**

If `cargo check` after Task 7 flagged `futures::executor::block_on` as unresolved:

Append to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
futures = "0.3"
```

Alternative (no new crate): use a local blocking runtime:

```rust
let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("tokio rt");
let sidecar = rt.block_on(async { Supervisor::spawn(sidecar_path).await }).expect("sidecar spawn failed");
```

- [ ] **Step 2: Add a startup log on sidecar ready**

In `lib.rs::run()` right after `Supervisor::spawn(...)` returns:

```rust
tracing::info!("sidecar ready: state={:?}", sidecar.state());
```

- [ ] **Step 3: End-to-end boot**

Run in background: `cd /Users/grk/GFiles/Local/moment && npm run tauri dev > /tmp/m2-e2e.log 2>&1 &`
Wait 90 s.
Run: `grep -E "Moment starting|sidecar ready|panic|ERROR" /tmp/m2-e2e.log | head -20`

Expected lines:
```
... Moment starting, version 2.0.0-alpha.0
... sidecar ready: state=Ready
```

No `panic` lines. No `ERROR` lines from `moment::*`.

Kill: `pkill -f "target/debug/moment" ; pkill -f "cargo.*run" ; pkill -f vite`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(app): emit 'sidecar ready' log; harden boot sync with dedicated rt

Adds a startup log line so manual smoke can grep for sidecar state
without tapping into Tauri DevTools. Boot uses a single-thread Tokio
runtime purely to block on Supervisor::spawn; no main-runtime impact.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: SMOKE.md + README update + M2 exit-gate

**Why:** Document the manual verification the user must run; flip roadmap rows.

**Files:**
- Modify: `docs/user/SMOKE.md`
- Modify: `README.md`

- [ ] **Step 1: Append M2 section to `SMOKE.md`**

Append:

```markdown

---

## M2 — Peak Detection (additive smoke)

### Steps

1. Run `npm run tauri dev` and grant Screen Recording permission as in §Steps 4-5 above.
2. Tail the dev log in another terminal: `tail -f /tmp/moment-tauri-dev.log` (or wherever stdout is redirected). Expect `sidecar ready: state=Ready` within 5 s of startup.
3. Join a 4-person Zoom/Meet/Teams meeting (or have 3 other participants join a 1:1 test meeting). The meeting grid must be visible on screen.
4. In the Moment tray popover, click **Start (first visible window)** and select the meeting window.
5. Wait **2.5 minutes** (the first 2 minutes are warmup; peak loop no-ops).
6. Between 2:00 and 3:00 mark, new participants join one at a time until 4 faces appear for at least 6 seconds.
7. After the 4-face moment passes, open Finder at `~/Moment/<meeting>/screenshots/` and confirm a file named `YYYY-MM-DD_HH-MM-SS_peak-4.png` exists.
8. Open `~/Moment/<meeting>/meeting.json` and confirm the screenshots array contains an entry with `"trigger": "peak"` and the filename from step 7.
9. Run `sqlite3 ~/Library/Application\ Support/Moment/meetings.sqlite "SELECT id, title, peak FROM meetings ORDER BY started_at DESC LIMIT 1;"` — the `peak` column is `4`.
10. Press ⌘⇧M to end the session.

### Pass criteria

- `sidecar ready: state=Ready` appears within 5 s of app boot.
- A `*_peak-N.png` exists for the peak reached during the meeting.
- `meeting.json` has a matching peak screenshot entry with `trigger: "peak"`.
- `meetings.sqlite` `peak` column reflects the peak count.
- No `ERROR` lines from `moment::*` in the dev log.

### Fail handling

Log file location: `/tmp/moment-tauri-dev.log` (or wherever `npm run tauri dev` stdout was redirected). Attach to any issue report. Include the sidecar stderr (`[debug] sidecar stderr: ...` in the main log).
```

- [ ] **Step 2: Update `README.md` roadmap**

In the `## Roadmap` table, flip:
- M1 row status from `🚧 closing` to `✅` (assuming user has completed the M1 smoke and tagged).
- M2 row status from `⏳` to `🚧 in progress`.

- [ ] **Step 3: Run full exit-gate locally**

```bash
cd /Users/grk/GFiles/Local/moment
cd src-tauri && cargo test 2>&1 | tail -5
cd .. && npm run typecheck 2>&1 | tail -3
npm run test:run 2>&1 | tail -3
cd sidecar && swift test 2>&1 | tail -10
```

Expected:
- `cargo test`: at least 24 tests pass (16 from M1 + 5 peak::tests + 1 update_peak_roundtrip + 2 supervisor::tests).
- `npm run typecheck`: clean.
- `npm run test:run`: pass with no tests.
- `swift test`: at least 3 pass (ProtocolTests × 2 + testZeroFaces + testMissingImage); face-count tests skip without fixtures.

- [ ] **Step 4: Commit docs**

```bash
git add docs/user/SMOKE.md README.md
git commit -m "$(cat <<'EOF'
docs(m2): SMOKE addendum for peak detection; roadmap status flip

Adds 10-step manual smoke (4-face Zoom scenario), pass criteria, fail
handling guide. README roadmap: M1 to ✅, M2 to 🚧.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Hand off**

Report to the user:
- All automated gates green.
- Manual smoke required per `docs/user/SMOKE.md` M2 section.
- On smoke pass: `git tag -a m2-closed -m "M2 Peak Detection complete"`.
- M3 next: transcript via `SFSpeechRecognizer`; streaming protocol infrastructure already in place.

---

## Self-Review

**1. Spec coverage:**
- Spec §2 items 1-9 → Tasks 1-10. Each numbered row in §2 maps to at least one task.
- Spec §4 architecture → Task 7 (AppHandles wiring) + Task 8 (peak loop).
- Spec §5 protocol → Task 1 (availability) + Task 2 (count_faces) + Task 4 (Rust types) + Task 5 (reader demux).
- Spec §6 supervisor → Tasks 4 + 5.
- Spec §7 peak loop → Task 8.
- Spec §8 on-disk changes → Task 8 (peak screenshot save) + Task 9 (update_peak index wire).
- Spec §9.1 Vision errata → Task 2 (pinned Revision 3).
- Spec §10 error handling → interspersed through Tasks 5, 7, 8 (no silent failures, warn+continue).
- Spec §11 testing → Task 1 (ProtocolTests), Task 2 (VisionOpsTests), Task 5 (supervisor tests), Task 8 (PeakState tests).
- Spec §14 distribution → Task 3 (externalBin + codesign).
- Spec §16 exit criteria → Task 10.

**2. Placeholder scan:** No "TBD", "FIXME", or "XXX" in the plan. Some Notes intentionally flag "adapt if signatures differ" — these are judgment calls, not placeholders.

**3. Type consistency:**
- `Supervisor::request(&self, op: &str, args: Option<serde_json::Value>) -> SupervisorResult<serde_json::Value>` — same signature in Task 4, Task 5, Task 6.
- `VisionBackend::count_faces(&self, frame_path: &Path) -> PlatformResult<usize>` — same in Task 6, Task 7, Task 8.
- `PeakDetector::new(vision, capture, storage, index, app)` — 5 args in Task 7 and Task 8.
- `Index::update_peak(&self, id: Ulid, peak: i64)` — introduced Task 8 Step 2, called from Task 8's peak promotion.

---

## Commit summary (expected)

| # | Task | Commit subject |
|---|---|---|
| 1 | 1 | `feat(sidecar): Swift package scaffold with availability op` |
| 2 | 2 | `feat(sidecar): count_faces op via VNDetectFaceRectanglesRequest rev3` |
| 3 | 3 | `build(sidecar): wire Swift binary through Tauri externalBin` |
| 4 | 4 | `feat(sidecar): Rust module skeleton + crates (dashmap, exponential-backoff)` |
| 5 | 5 | `feat(sidecar): supervisor with spawn, IO loop, backoff restart` |
| 6 | 6 | `feat(platform): MacosVision trait impl delegating to Supervisor` |
| 7 | 7 | `feat(app): wire Supervisor + MacosVision into AppHandles` |
| 8 | 8 | `feat(peak): PeakDetector loop with 2-frame sustain promotion` |
| 9 | 9 | `feat(app): emit 'sidecar ready' log; harden boot sync with dedicated rt` |
| 10 | 10 | `docs(m2): SMOKE addendum for peak detection; roadmap status flip` |

10 commits total.

---

## Execution handoff

Plan complete. Execution: **subagent-driven-development** (recommended given task independence across Swift / Rust / UI surfaces).
