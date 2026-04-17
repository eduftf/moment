# Moment M1 — Capture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working standalone macOS Tauri app that lets the user pick any visible window (Zoom/Meet/Teams/other), press a global hotkey, and save a PNG screenshot of that window into `~/Moment/<meeting>/screenshots/` with a meeting.json side-car — no Zoom SDK involved.

**Architecture:** Tauri 2.x shell. React UI reused from legacy Zoom-sidebar code provides a menubar popover + window picker. Rust core exposes `#[tauri::command]` handlers backed by trait-based platform abstraction. macOS `CaptureBackend` impl uses the `screencapturekit` crate (Rust bindings for ScreenCaptureKit). Storage writes to a versioned meeting folder under `~/Moment/` plus a SQLite index at `~/Library/Application Support/Moment/meetings.sqlite`. No AI, no audio, no transcript in this milestone.

**Tech Stack:** Tauri 2, Rust 1.80+, `screencapturekit` crate, `rusqlite`, `tauri-plugin-global-shortcut`, `tauri-plugin-notification`, React 18 + Vite 6 + TypeScript (reused), Vitest.

**Spec reference:** `docs/superpowers/specs/2026-04-17-moment-standalone-design.md` (§§ 2, 3, 4, 5).

**Supersedes:** `app/` and `companion/` (moved to `legacy/` in Task 1).

---

## File Structure (after M1)

```
moment/
├── legacy/                         # Task 1
│   ├── zoom-app/                   # former app/
│   ├── companion/                  # former companion/
│   └── README.md                   # "Archived — see docs/superpowers/specs/2026-04-17-..."
├── src/                            # React frontend (reuses legacy/zoom-app/src)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── MenuBarPopover.tsx      # Task 14
│   │   ├── WindowPicker.tsx        # Task 14
│   │   └── PermissionGate.tsx      # Task 15
│   └── api/tauri.ts                # wrappers around invoke()
├── src-tauri/                      # Rust core
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   └── src/
│       ├── main.rs                 # Task 2 — entrypoint
│       ├── lib.rs                  # Task 2 — run() fn
│       ├── platform/
│       │   ├── mod.rs              # Task 4 — traits + errors
│       │   └── macos/
│       │       ├── mod.rs          # Task 5
│       │       └── capture.rs      # Tasks 5, 6
│       ├── session.rs              # Task 8 — state machine
│       ├── storage.rs              # Task 9 — folders + meeting.json
│       ├── index_db.rs             # Task 11 — SQLite meetings index
│       ├── commands/
│       │   ├── mod.rs              # Task 7 — registration
│       │   ├── windows.rs          # Task 7 — get_windows
│       │   ├── session.rs          # Task 8 — start/stop
│       │   └── capture.rs          # Task 10 — capture_manual
│       └── shortcuts.rs            # Task 12 — hotkey wiring
├── index.html
├── package.json                    # rewritten in Task 2
├── tsconfig.json
├── vite.config.ts
└── docs/
    ├── superpowers/                # this file lives here
    └── user/
        └── SMOKE.md                # Task 16
```

---

## Pre-flight

Before starting, confirm:
- macOS 12.3+ (ScreenCaptureKit requirement).
- Rust toolchain installed: `rustc --version` returns 1.80+.
- Node 22+: `node --version`.
- Xcode Command Line Tools: `xcode-select -p` returns a path.
- `cargo-tauri` v2: `cargo install tauri-cli --version "^2.0"` if missing.
- User has read+write access to `~/Moment` and `~/Library/Application Support/`.

---

## Task 1: Archive legacy code

**Files:**
- Move: `app/` → `legacy/zoom-app/`
- Move: `companion/` → `legacy/companion/`
- Create: `legacy/README.md`
- Modify: `package.json` (root) — drop workspaces
- Modify: `.github/workflows/deploy.yml` — pause (comment out steps that reference `app/`)

- [ ] **Step 1: Verify git clean for tracked files (unstaged README.md and public/*.html pre-existing edits are accepted as unrelated)**

```bash
git status
```

Expected: only `README.md`, `app/public/privacy.html`, `app/public/support.html`, `app/public/terms.html` modified (pre-existing); no staged changes.

- [ ] **Step 2: Create legacy dir and move trees**

```bash
mkdir -p legacy
git mv app legacy/zoom-app
git mv companion legacy/companion
```

- [ ] **Step 3: Write `legacy/README.md`**

```markdown
# Legacy — Zoom App + Companion (archived 2026-04-17)

This directory contains the original Moment architecture: a Zoom App
(React iframe sidebar) plus a Companion CLI (Node.js WebSocket server).

It is archived as a read-only reference. New work happens at the
repo root (Tauri standalone app). See:

- Spec: `../docs/superpowers/specs/2026-04-17-moment-standalone-design.md`
- Plan M1: `../docs/superpowers/plans/2026-04-17-moment-m1-capture-foundation.md`

Do NOT add features here. If you need to understand a previous behaviour,
read, don't modify.
```

Run:
```bash
cat > legacy/README.md <<'EOF'
# Legacy — Zoom App + Companion (archived 2026-04-17)

This directory contains the original Moment architecture: a Zoom App
(React iframe sidebar) plus a Companion CLI (Node.js WebSocket server).

It is archived as a read-only reference. New work happens at the
repo root (Tauri standalone app). See:

- Spec: `../docs/superpowers/specs/2026-04-17-moment-standalone-design.md`
- Plan M1: `../docs/superpowers/plans/2026-04-17-moment-m1-capture-foundation.md`

Do NOT add features here. If you need to understand a previous behaviour,
read, don't modify.
EOF
```

- [ ] **Step 4: Replace root `package.json` (remove workspace references)**

Write:
```json
{
  "name": "moment",
  "description": "Local macOS app that archives meeting moments — screenshots, transcript, AI summary, all on-device.",
  "version": "2.0.0-alpha.0",
  "private": true,
  "license": "MIT",
  "author": "GTools <contact@gtools.space> (https://gtools.space)",
  "homepage": "https://moment.gtools.space",
  "repository": { "type": "git", "url": "https://github.com/eduftf/moment" },
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "tsc -b",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.1.0",
    "@tauri-apps/plugin-global-shortcut": "^2.0.1",
    "@tauri-apps/plugin-notification": "^2.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^6.0.1",
    "vitest": "^2.1.5",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 5: Pause existing GitHub Actions that reference `app/`**

Modify `.github/workflows/deploy.yml` — add a top-level guard:
```yaml
on:
  push:
    branches: [this-branch-is-intentionally-parked]
```

This disables the pipeline without deleting it (a new workflow arrives in M6).

- [ ] **Step 6: Commit**

`git mv` already staged the rename; the new files (`legacy/README.md`) and rewritten `package.json` need explicit adds.

```bash
git add legacy/README.md package.json .github/workflows/deploy.yml
git commit -m "chore(legacy): archive zoom-app and companion; reset root package.json for Tauri"
```

---

## Task 2: Bootstrap Tauri 2 project structure

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "moment"
version = "2.0.0-alpha.0"
description = "Local macOS meeting archiver"
edition = "2021"
rust-version = "1.80"

[lib]
name = "moment_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.1", features = ["macos-private-api", "tray-icon"] }
tauri-plugin-global-shortcut = "2.0"
tauri-plugin-notification = "2.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "fs"] }
async-trait = "0.1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
chrono = { version = "0.4", features = ["serde"] }
ulid = { version = "1", features = ["serde"] }
rusqlite = { version = "0.32", features = ["bundled"] }
directories = "5"

# Tasks 5+ add screencapturekit on macOS only
[target.'cfg(target_os = "macos")'.dependencies]
screencapturekit = "0.3"
core-foundation = "0.10"
core-graphics = "0.24"

[dev-dependencies]
tempfile = "3"
tokio-test = "0.4"
```

- [ ] **Step 2: Write `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 3: Write `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Moment",
  "version": "2.0.0-alpha.0",
  "identifier": "space.gtools.moment",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Moment",
        "width": 820,
        "height": 640,
        "visible": false,
        "center": true,
        "decorations": true
      }
    ],
    "macOSPrivateApi": true,
    "security": { "csp": "default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" },
    "trayIcon": {
      "id": "moment-tray",
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": true
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "icon": ["icons/icon.icns"],
    "category": "Productivity",
    "macOS": {
      "minimumSystemVersion": "12.3",
      "entitlements": null,
      "exceptionDomain": null
    }
  },
  "plugins": {}
}
```

Note: icons are placeholder; any valid `icon.png` + `icon.icns` works for M1. Copy from `legacy/zoom-app/public/favicon.png` as a stopgap:

```bash
mkdir -p src-tauri/icons
cp legacy/zoom-app/public/favicon.png src-tauri/icons/icon.png 2>/dev/null || \
  printf '%s' '' > src-tauri/icons/icon.png
```

For `.icns`, run once:
```bash
mkdir -p /tmp/icon.iconset
sips -z 16 16   src-tauri/icons/icon.png --out /tmp/icon.iconset/icon_16x16.png
sips -z 32 32   src-tauri/icons/icon.png --out /tmp/icon.iconset/icon_32x32.png
sips -z 128 128 src-tauri/icons/icon.png --out /tmp/icon.iconset/icon_128x128.png
sips -z 512 512 src-tauri/icons/icon.png --out /tmp/icon.iconset/icon_512x512.png
iconutil -c icns /tmp/icon.iconset -o src-tauri/icons/icon.icns
```

- [ ] **Step 4: Write `src-tauri/src/lib.rs`**

```rust
use tauri::Manager;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,moment=debug".into()))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            tracing::info!("Moment starting, version {}", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Write `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    moment_lib::run();
}
```

- [ ] **Step 6: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": []
}
```

- [ ] **Step 7: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
    hmr: { protocol: "ws", host: "localhost", port: 1421 }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  }
});
```

- [ ] **Step 8: Write `index.html`**

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Moment</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Write `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 10: Write `src/App.tsx`**

```tsx
export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Moment</h1>
      <p>Capture Foundation — M1</p>
    </main>
  );
}
```

- [ ] **Step 11: Write `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 12: Install deps and run dev smoke test**

```bash
npm install
npm run tauri dev
```

Expected: a Tauri window opens showing "Moment — Capture Foundation — M1". Close it.

- [ ] **Step 13: Commit**

```bash
git add src-tauri src package.json tsconfig.json vite.config.ts index.html
git commit -m "feat(tauri): bootstrap Tauri 2 skeleton with React + Vite frontend"
```

---

## Task 3: Port React entrypoint utilities from legacy

**Files:**
- Create: `src/api/tauri.ts`

Why: we will call Rust commands from React. Centralize the wrapper here so every component imports typed helpers, not raw `invoke` strings.

- [ ] **Step 1: Write `src/api/tauri.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";

export type WindowInfo = {
  id: number;
  title: string;
  app: string;
  bounds: { x: number; y: number; width: number; height: number };
};

export type SessionState =
  | { kind: "idle" }
  | { kind: "selecting" }
  | { kind: "recording"; meetingId: string; windowId: number; startedAt: string }
  | { kind: "finalizing"; meetingId: string }
  | { kind: "done"; meetingId: string };

export const tauri = {
  getWindows: () => invoke<WindowInfo[]>("get_windows"),
  startSession: (windowId: number, title: string | null) =>
    invoke<SessionState>("start_session", { windowId, title }),
  stopSession: () => invoke<SessionState>("stop_session"),
  sessionState: () => invoke<SessionState>("session_state"),
  captureManual: () => invoke<string>("capture_manual"),
  grantedPermissions: () => invoke<{ screen: boolean }>("granted_permissions"),
  openScreenRecordingPrefs: () => invoke<void>("open_screen_recording_prefs")
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api
git commit -m "feat(ui): add typed tauri api wrapper"
```

---

## Task 4: Platform abstraction traits

**Files:**
- Create: `src-tauri/src/platform/mod.rs`
- Test: `src-tauri/src/platform/mod.rs` (inline `#[cfg(test)]`)

- [ ] **Step 1: Write a failing test for the availability enum**

`src-tauri/src/platform/mod.rs`:
```rust
use std::path::PathBuf;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("unsupported on this platform")]
    Unsupported,
    #[error("permission denied: {0}")]
    PermissionDenied(&'static str),
    #[error("window not found: {0}")]
    WindowNotFound(WindowId),
    #[error("backend error: {0}")]
    Backend(String),
}

pub type PlatformResult<T> = Result<T, PlatformError>;

pub type WindowId = u64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WindowInfo {
    pub id: WindowId,
    pub title: String,
    pub app: String,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub png_path: PathBuf,
    pub captured_at: chrono::DateTime<chrono::Utc>,
}

#[async_trait]
pub trait CaptureBackend: Send + Sync {
    async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>>;
    async fn capture_window(&self, id: WindowId, dest_dir: &std::path::Path) -> PlatformResult<Frame>;
    async fn screen_recording_granted(&self) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_error_display_is_stable() {
        let e = PlatformError::PermissionDenied("screen_recording");
        assert_eq!(e.to_string(), "permission denied: screen_recording");
    }

    #[test]
    fn window_info_roundtrips_json() {
        let w = WindowInfo {
            id: 42,
            title: "Zoom Meeting".into(),
            app: "zoom.us".into(),
            bounds: Bounds { x: 0.0, y: 0.0, width: 1200.0, height: 800.0 },
        };
        let j = serde_json::to_string(&w).unwrap();
        let back: WindowInfo = serde_json::from_str(&j).unwrap();
        assert_eq!(w, back);
    }
}
```

- [ ] **Step 2: Wire the module in `lib.rs`**

Add near the top of `src-tauri/src/lib.rs`:
```rust
pub mod platform;
```

- [ ] **Step 3: Run tests — expect compile error (no `macos` submodule yet is fine; we only test the trait file)**

```bash
cd src-tauri && cargo test platform:: 2>&1 | tail -30
```

Expected: `platform::tests::platform_error_display_is_stable` and `platform::tests::window_info_roundtrips_json` PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/platform src-tauri/src/lib.rs
git commit -m "feat(platform): define CaptureBackend trait and error types"
```

---

## Task 5: macOS `CaptureBackend` — list_windows

**Files:**
- Create: `src-tauri/src/platform/macos/mod.rs`
- Create: `src-tauri/src/platform/macos/capture.rs`

- [ ] **Step 1: Write `src-tauri/src/platform/macos/mod.rs`**

```rust
#![cfg(target_os = "macos")]

pub mod capture;

pub use capture::MacosCapture;
```

- [ ] **Step 2: Write a failing test first**

`src-tauri/src/platform/macos/capture.rs`:
```rust
#![cfg(target_os = "macos")]

use std::path::Path;

use async_trait::async_trait;
use screencapturekit::{
    shareable_content::SCShareableContent,
    stream::{
        content_filter::{InitParams, SCContentFilter},
        configuration::SCStreamConfiguration,
        output_type::SCStreamOutputType,
        SCStream,
    },
};

use crate::platform::{
    Bounds, CaptureBackend, Frame, PlatformError, PlatformResult, WindowId, WindowInfo,
};

pub struct MacosCapture;

impl MacosCapture {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl CaptureBackend for MacosCapture {
    async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>> {
        let content = tokio::task::spawn_blocking(|| {
            SCShareableContent::get().map_err(|e| PlatformError::Backend(e.to_string()))
        })
        .await
        .map_err(|e| PlatformError::Backend(e.to_string()))??;

        let windows = content
            .windows()
            .into_iter()
            .filter(|w| w.is_on_screen() && !w.title().as_deref().unwrap_or("").is_empty())
            .map(|w| {
                let frame = w.frame();
                WindowInfo {
                    id: w.window_id() as WindowId,
                    title: w.title().unwrap_or_default().to_string(),
                    app: w.owning_application().map(|a| a.application_name()).unwrap_or_default(),
                    bounds: Bounds {
                        x: frame.origin.x,
                        y: frame.origin.y,
                        width: frame.size.width,
                        height: frame.size.height,
                    },
                }
            })
            .collect();

        Ok(windows)
    }

    async fn capture_window(&self, _id: WindowId, _dest_dir: &Path) -> PlatformResult<Frame> {
        Err(PlatformError::Unsupported) // implemented in Task 6
    }

    async fn screen_recording_granted(&self) -> bool {
        // CGPreflightScreenCaptureAccess via core-graphics crate
        use core_graphics::access::ScreenCaptureAccess;
        ScreenCaptureAccess.preflight()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn list_windows_returns_at_least_one_on_a_normal_desktop() {
        let cap = MacosCapture::new();
        let windows = cap.list_windows().await.expect("list_windows");
        // On any running macOS developer machine the Finder has at least one titled window;
        // if this test is ever run headless CI, skip via CI env.
        if std::env::var("CI").is_ok() {
            eprintln!("skipping list_windows assertion on CI");
            return;
        }
        assert!(!windows.is_empty(), "expected at least one visible titled window");
        for w in windows {
            assert!(w.bounds.width > 0.0);
            assert!(w.bounds.height > 0.0);
        }
    }
}
```

- [ ] **Step 3: Register the module in `platform/mod.rs`**

At the bottom of `src-tauri/src/platform/mod.rs`:
```rust
#[cfg(target_os = "macos")]
pub mod macos;
```

- [ ] **Step 4: Run test — expect PASS on dev Mac**

```bash
cd src-tauri && cargo test platform::macos::capture::tests::list_windows -- --nocapture
```

Expected: PASS. If it FAILS with `PlatformError::Backend("access to ScreenCaptureKit requires permission")`, grant Screen Recording permission to your terminal in **System Settings → Privacy & Security → Screen Recording**, then re-run. If it FAILS because method signatures in `screencapturekit` 0.3 differ from the snippet above, adjust imports to match; the trait contract stays identical.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/platform
git commit -m "feat(platform/macos): list_windows via ScreenCaptureKit"
```

---

## Task 6: macOS `CaptureBackend` — capture_window

**Files:**
- Modify: `src-tauri/src/platform/macos/capture.rs` — implement `capture_window`

- [ ] **Step 1: Write a failing test**

Append inside `mod tests` of `capture.rs`:
```rust
#[tokio::test]
async fn capture_window_writes_a_png_file() {
    if std::env::var("CI").is_ok() {
        eprintln!("skipping capture_window on CI");
        return;
    }
    let cap = MacosCapture::new();
    let windows = cap.list_windows().await.expect("list_windows");
    let window = windows.into_iter().next().expect("need at least one window for test");

    let tmp = tempfile::tempdir().expect("tempdir");
    let frame = cap.capture_window(window.id, tmp.path()).await.expect("capture");

    assert!(frame.png_path.exists(), "png must exist");
    let bytes = std::fs::read(&frame.png_path).expect("read png");
    assert!(bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]), "PNG magic bytes");
    assert!(frame.width > 0 && frame.height > 0);
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd src-tauri && cargo test platform::macos::capture::tests::capture_window_writes_a_png_file -- --nocapture
```

Expected: FAIL — `PlatformError::Unsupported`.

- [ ] **Step 3: Implement `capture_window`**

Replace the body of the `capture_window` method in `MacosCapture` impl:

```rust
async fn capture_window(&self, id: WindowId, dest_dir: &Path) -> PlatformResult<Frame> {
    let dest_dir = dest_dir.to_path_buf();
    let (width, height, png_path, captured_at) =
        tokio::task::spawn_blocking(move || -> PlatformResult<(u32, u32, std::path::PathBuf, chrono::DateTime<chrono::Utc>)> {
            let content = SCShareableContent::get()
                .map_err(|e| PlatformError::Backend(e.to_string()))?;
            let window = content
                .windows()
                .into_iter()
                .find(|w| w.window_id() as WindowId == id)
                .ok_or(PlatformError::WindowNotFound(id))?;

            let filter = SCContentFilter::new(InitParams::DesktopIndependentWindow(window.clone()));

            let frame = window.frame();
            let w = frame.size.width as u32;
            let h = frame.size.height as u32;

            let config = SCStreamConfiguration::new()
                .set_width(w)
                .map_err(|e| PlatformError::Backend(e.to_string()))?
                .set_height(h)
                .map_err(|e| PlatformError::Backend(e.to_string()))?;

            // Capture a single frame: start stream, grab first frame, stop.
            let (tx, rx) = std::sync::mpsc::channel();
            struct OneShot(std::sync::Mutex<Option<std::sync::mpsc::Sender<Vec<u8>>>>);
            impl screencapturekit::stream::output_trait::SCStreamOutputTrait for OneShot {
                fn did_output_sample_buffer(
                    &self,
                    sample_buffer: screencapturekit::cm_sample_buffer::CMSampleBuffer,
                    of_type: SCStreamOutputType,
                ) {
                    if of_type != SCStreamOutputType::Screen { return; }
                    if let Some(tx) = self.0.lock().unwrap().take() {
                        if let Ok(image) = sample_buffer.as_image() {
                            if let Ok(png) = image.encode_png() {
                                let _ = tx.send(png);
                            }
                        }
                    }
                }
            }

            let handler = OneShot(std::sync::Mutex::new(Some(tx)));
            let mut stream = SCStream::new(&filter, &config);
            stream.add_output_handler(handler, SCStreamOutputType::Screen);
            stream.start_capture().map_err(|e| PlatformError::Backend(e.to_string()))?;
            let png = rx.recv_timeout(std::time::Duration::from_secs(3))
                .map_err(|_| PlatformError::Backend("no frame received within 3s".into()))?;
            stream.stop_capture().map_err(|e| PlatformError::Backend(e.to_string()))?;

            std::fs::create_dir_all(&dest_dir).map_err(|e| PlatformError::Backend(e.to_string()))?;
            let captured_at = chrono::Utc::now();
            let filename = format!("{}.png", captured_at.format("%Y-%m-%d_%H-%M-%S"));
            let png_path = dest_dir.join(filename);
            std::fs::write(&png_path, &png).map_err(|e| PlatformError::Backend(e.to_string()))?;

            Ok((w, h, png_path, captured_at))
        })
        .await
        .map_err(|e| PlatformError::Backend(e.to_string()))??;

    Ok(Frame { width, height, png_path, captured_at })
}
```

Note: exact method names on `CMSampleBuffer` (`as_image`, `encode_png`) vary by `screencapturekit` crate version. If the trait signatures differ in 0.3, adapt but preserve: "capture one frame, write PNG bytes, return path + dimensions".

- [ ] **Step 4: Run test — expect PASS**

```bash
cd src-tauri && cargo test platform::macos::capture::tests::capture_window_writes_a_png_file -- --nocapture
```

Expected: PASS. A PNG appears in a tempdir that is cleaned up automatically.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/platform/macos/capture.rs
git commit -m "feat(platform/macos): capture single window frame to PNG"
```

---

## Task 7: Tauri command — `get_windows`

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/windows.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write `src-tauri/src/commands/mod.rs`**

```rust
pub mod capture;
pub mod session;
pub mod windows;

use tauri::Runtime;

pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        windows::get_windows,
        session::start_session,
        session::stop_session,
        session::session_state,
        capture::capture_manual,
        windows::granted_permissions,
        windows::open_screen_recording_prefs,
    ])
}
```

- [ ] **Step 2: Write a failing test in `windows.rs`**

`src-tauri/src/commands/windows.rs`:
```rust
use tauri::State;
use crate::platform::{CaptureBackend, WindowInfo};
use crate::AppHandles;

#[tauri::command]
pub async fn get_windows(state: State<'_, AppHandles>) -> Result<Vec<WindowInfo>, String> {
    state.capture.list_windows().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn granted_permissions(state: State<'_, AppHandles>) -> Result<serde_json::Value, String> {
    let screen = state.capture.screen_recording_granted().await;
    Ok(serde_json::json!({ "screen": screen }))
}

#[tauri::command]
pub async fn open_screen_recording_prefs() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Only implemented on macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{Bounds, CaptureBackend, Frame, PlatformError, PlatformResult, WindowId};
    use async_trait::async_trait;
    use std::path::Path;

    struct FakeCapture {
        windows: Vec<WindowInfo>,
    }

    #[async_trait]
    impl CaptureBackend for FakeCapture {
        async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>> {
            Ok(self.windows.clone())
        }
        async fn capture_window(&self, _id: WindowId, _dir: &Path) -> PlatformResult<Frame> {
            Err(PlatformError::Unsupported)
        }
        async fn screen_recording_granted(&self) -> bool { true }
    }

    #[tokio::test]
    async fn list_windows_fake_backend_returns_configured_list() {
        let fake = FakeCapture {
            windows: vec![WindowInfo {
                id: 1, title: "Zoom".into(), app: "zoom.us".into(),
                bounds: Bounds { x: 0.0, y: 0.0, width: 640.0, height: 480.0 }
            }]
        };
        let list = fake.list_windows().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Zoom");
    }
}
```

- [ ] **Step 3: Add `AppHandles` to `lib.rs`**

```rust
use std::sync::Arc;
use crate::platform::CaptureBackend;

pub mod platform;
pub mod commands;

pub struct AppHandles {
    pub capture: Arc<dyn CaptureBackend>,
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

    let handles = AppHandles { capture: build_capture() };

    commands::register(
        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .manage(handles)
    )
    .setup(|app| {
        tracing::info!("Moment starting, version {}", app.package_info().version);
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test commands::windows
```

Expected: `list_windows_fake_backend_returns_configured_list` PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands src-tauri/src/lib.rs
git commit -m "feat(commands): expose get_windows, granted_permissions, open_screen_recording_prefs"
```

---

## Task 8: Session state machine + start/stop commands

**Files:**
- Create: `src-tauri/src/session.rs`
- Create: `src-tauri/src/commands/session.rs`

- [ ] **Step 1: Write `src-tauri/src/session.rs`**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::platform::WindowId;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SessionState {
    Idle,
    Selecting,
    Recording { meeting_id: Ulid, window_id: WindowId, started_at: DateTime<Utc>, title: String, path: String },
    Finalizing { meeting_id: Ulid },
    Done { meeting_id: Ulid },
}

impl SessionState {
    pub fn idle() -> Self { Self::Idle }
    pub fn is_recording(&self) -> bool { matches!(self, Self::Recording { .. }) }
    pub fn meeting_id(&self) -> Option<Ulid> {
        match self {
            Self::Recording { meeting_id, .. }
            | Self::Finalizing { meeting_id }
            | Self::Done { meeting_id } => Some(*meeting_id),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_is_not_recording() {
        assert!(!SessionState::idle().is_recording());
    }

    #[test]
    fn recording_reports_meeting_id() {
        let id = Ulid::new();
        let s = SessionState::Recording {
            meeting_id: id,
            window_id: 1,
            started_at: Utc::now(),
            title: "t".into(),
            path: "/tmp/m".into(),
        };
        assert_eq!(s.meeting_id(), Some(id));
        assert!(s.is_recording());
    }
}
```

- [ ] **Step 2: Write `src-tauri/src/commands/session.rs`**

```rust
use chrono::Utc;
use tauri::State;
use tokio::sync::Mutex;
use ulid::Ulid;

use crate::platform::{CaptureBackend, WindowId};
use crate::session::SessionState;
use crate::storage::Storage;
use crate::AppHandles;

// Placeholder: Storage inserted in Task 9; until then, a stub.

#[tauri::command]
pub async fn start_session(
    state: State<'_, AppHandles>,
    window_id: WindowId,
    title: Option<String>,
) -> Result<SessionState, String> {
    let mut guard = state.session.lock().await;
    if guard.is_recording() {
        return Err("a session is already recording".into());
    }

    // verify window exists
    let windows = state.capture.list_windows().await.map_err(|e| e.to_string())?;
    let window = windows.into_iter().find(|w| w.id == window_id)
        .ok_or_else(|| format!("window {} not found", window_id))?;

    let meeting_id = Ulid::new();
    let now = Utc::now();
    let resolved_title = title.unwrap_or_else(|| window.title.clone());
    let meeting_path = state.storage.create_meeting_dir(&resolved_title, now)
        .map_err(|e| e.to_string())?;

    *guard = SessionState::Recording {
        meeting_id,
        window_id,
        started_at: now,
        title: resolved_title.clone(),
        path: meeting_path.display().to_string(),
    };
    state.storage.write_meeting_json(&meeting_path, meeting_id, &resolved_title, window_id, now)
        .map_err(|e| e.to_string())?;

    Ok(guard.clone())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    let mut guard = state.session.lock().await;
    let meeting_id = guard.meeting_id().ok_or_else(|| "no active session".to_string())?;
    if let SessionState::Recording { path, .. } = guard.clone() {
        state.storage.finalize_meeting_json(std::path::Path::new(&path), Utc::now())
            .map_err(|e| e.to_string())?;
    }
    *guard = SessionState::Done { meeting_id };
    Ok(guard.clone())
}

#[tauri::command]
pub async fn session_state(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    Ok(state.session.lock().await.clone())
}
```

- [ ] **Step 3: Extend `AppHandles`**

Modify `src-tauri/src/lib.rs`:
```rust
pub mod session;
pub mod storage;

use tokio::sync::Mutex;

pub struct AppHandles {
    pub capture: Arc<dyn platform::CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub session: Mutex<session::SessionState>,
}
```

And update `run()`:
```rust
let handles = AppHandles {
    capture: build_capture(),
    storage: Arc::new(storage::Storage::default()),
    session: Mutex::new(session::SessionState::idle()),
};
```

- [ ] **Step 4: Run session unit tests**

```bash
cd src-tauri && cargo test session::
```

Expected: 2 tests PASS (`idle_is_not_recording`, `recording_reports_meeting_id`). `commands/session.rs` compiles only after Task 9 adds `Storage`; expect an E0433 "unresolved module `storage`" until then — this is intentional, fix it in Task 9.

- [ ] **Step 5: Commit (compile may fail, that's OK — gated fix comes in Task 9)**

```bash
git add src-tauri/src/session.rs src-tauri/src/commands/session.rs src-tauri/src/lib.rs
git commit -m "feat(session): state machine + start/stop/session_state commands (depends on storage)"
```

---

## Task 9: Storage — meeting folder + meeting.json

**Files:**
- Create: `src-tauri/src/storage.rs`

- [ ] **Step 1: Write a failing test first**

`src-tauri/src/storage.rs`:
```rust
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::platform::WindowId;

#[derive(thiserror::Error, Debug)]
pub enum StorageError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("home directory unknown")]
    NoHome,
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingMetadata {
    pub id: Ulid,
    pub schema_version: u32,
    pub title: String,
    pub window_title: String,
    pub window_id: WindowId,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub screenshots: Vec<ScreenshotEntry>,
    pub events: Vec<Event>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotEntry {
    pub file: String,
    pub trigger: String, // manual | peak | voice | hotkey
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub kind: String,
    pub at: DateTime<Utc>,
    pub detail: serde_json::Value,
}

pub struct Storage {
    pub root: PathBuf,
}

impl Default for Storage {
    fn default() -> Self {
        let home = directories::BaseDirs::new()
            .map(|b| b.home_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        Self { root: home.join("Moment") }
    }
}

impl Storage {
    pub fn new(root: PathBuf) -> Self { Self { root } }

    pub fn create_meeting_dir(&self, title: &str, started_at: DateTime<Utc>) -> StorageResult<PathBuf> {
        let safe = sanitize_title(title);
        let dir = self.root.join(format!("{} {}", started_at.format("%Y-%m-%d %H-%M"), safe));
        std::fs::create_dir_all(dir.join("screenshots"))?;
        Ok(dir)
    }

    pub fn write_meeting_json(
        &self,
        dir: &Path,
        meeting_id: Ulid,
        title: &str,
        window_id: WindowId,
        started_at: DateTime<Utc>,
    ) -> StorageResult<()> {
        let m = MeetingMetadata {
            id: meeting_id,
            schema_version: 1,
            title: title.into(),
            window_title: title.into(),
            window_id,
            started_at,
            ended_at: None,
            screenshots: vec![],
            events: vec![Event {
                kind: "start".into(),
                at: started_at,
                detail: serde_json::json!({}),
            }],
        };
        let path = dir.join("meeting.json");
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }

    pub fn finalize_meeting_json(&self, dir: &Path, ended_at: DateTime<Utc>) -> StorageResult<()> {
        let path = dir.join("meeting.json");
        let bytes = std::fs::read(&path)?;
        let mut m: MeetingMetadata = serde_json::from_slice(&bytes)?;
        m.ended_at = Some(ended_at);
        m.events.push(Event { kind: "end".into(), at: ended_at, detail: serde_json::json!({}) });
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }

    pub fn append_screenshot(
        &self,
        dir: &Path,
        entry: ScreenshotEntry,
    ) -> StorageResult<()> {
        let path = dir.join("meeting.json");
        let bytes = std::fs::read(&path)?;
        let mut m: MeetingMetadata = serde_json::from_slice(&bytes)?;
        m.events.push(Event {
            kind: "manual_capture".into(),
            at: entry.at,
            detail: serde_json::json!({ "file": entry.file, "trigger": entry.trigger }),
        });
        m.screenshots.push(entry);
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }
}

fn sanitize_title(title: &str) -> String {
    title.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .chars().take(60).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn create_meeting_dir_writes_screenshots_subdir() {
        let tmp = tempdir().unwrap();
        let s = Storage::new(tmp.path().to_path_buf());
        let dir = s.create_meeting_dir("Team Sync", Utc::now()).unwrap();
        assert!(dir.join("screenshots").is_dir());
    }

    #[test]
    fn write_and_finalize_meeting_json_roundtrip() {
        let tmp = tempdir().unwrap();
        let s = Storage::new(tmp.path().to_path_buf());
        let now = Utc::now();
        let dir = s.create_meeting_dir("Test", now).unwrap();
        let id = Ulid::new();
        s.write_meeting_json(&dir, id, "Test", 42, now).unwrap();
        s.finalize_meeting_json(&dir, now).unwrap();

        let m: MeetingMetadata = serde_json::from_slice(&std::fs::read(dir.join("meeting.json")).unwrap()).unwrap();
        assert_eq!(m.id, id);
        assert!(m.ended_at.is_some());
        assert_eq!(m.events.len(), 2); // start + end
    }

    #[test]
    fn sanitize_title_drops_slashes() {
        assert_eq!(sanitize_title("a/b:c"), "a_b_c");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test storage::
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/storage.rs
git commit -m "feat(storage): meeting folder + meeting.json read/write/finalize"
```

---

## Task 10: Manual capture command

**Files:**
- Create: `src-tauri/src/commands/capture.rs`

- [ ] **Step 1: Write the command**

`src-tauri/src/commands/capture.rs`:
```rust
use chrono::Utc;
use tauri::State;

use crate::session::SessionState;
use crate::storage::ScreenshotEntry;
use crate::AppHandles;

#[tauri::command]
pub async fn capture_manual(state: State<'_, AppHandles>) -> Result<String, String> {
    let snapshot = state.session.lock().await.clone();
    let (meeting_path, window_id) = match snapshot {
        SessionState::Recording { path, window_id, .. } => (std::path::PathBuf::from(path), window_id),
        _ => return Err("no active session".into()),
    };

    let screenshots_dir = meeting_path.join("screenshots");
    let frame = state.capture.capture_window(window_id, &screenshots_dir).await
        .map_err(|e| e.to_string())?;

    let file = frame.png_path
        .strip_prefix(&meeting_path)
        .unwrap_or(&frame.png_path)
        .display()
        .to_string();

    state.storage.append_screenshot(
        &meeting_path,
        ScreenshotEntry { file: file.clone(), trigger: "manual".into(), at: Utc::now() },
    ).map_err(|e| e.to_string())?;

    Ok(file)
}
```

- [ ] **Step 2: Verify the whole workspace compiles**

```bash
cd src-tauri && cargo check
```

Expected: clean compile. If `commands/session.rs` still references `storage::Storage`, it now resolves — compile succeeds.

- [ ] **Step 3: Run the full rust test suite**

```bash
cd src-tauri && cargo test
```

Expected: all tests from Tasks 4, 6, 8, 9 PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/capture.rs
git commit -m "feat(commands): capture_manual saves PNG and appends screenshot entry"
```

---

## Task 11: SQLite meetings index

**Files:**
- Create: `src-tauri/src/index_db.rs`
- Modify: `src-tauri/src/lib.rs` — construct `Index`
- Modify: `src-tauri/src/commands/session.rs` — call `Index::insert_started` / `Index::mark_ended`

- [ ] **Step 1: Write `src-tauri/src/index_db.rs`**

```rust
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use ulid::Ulid;

#[derive(thiserror::Error, Debug)]
pub enum IndexError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("directories: unable to resolve data dir")]
    NoDataDir,
}

pub type IndexResult<T> = Result<T, IndexError>;

pub struct Index {
    conn: std::sync::Mutex<Connection>,
}

impl Index {
    pub fn open_default() -> IndexResult<Self> {
        let dirs = directories::ProjectDirs::from("space", "GTools", "Moment")
            .ok_or(IndexError::NoDataDir)?;
        let data_dir = dirs.data_dir().to_path_buf();
        std::fs::create_dir_all(&data_dir).map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;
        Self::open(data_dir.join("meetings.sqlite"))
    }

    pub fn open(path: PathBuf) -> IndexResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                path TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                peak INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS meetings_started_idx ON meetings(started_at DESC);
            "#,
        )?;
        Ok(Self { conn: std::sync::Mutex::new(conn) })
    }

    pub fn insert_started(&self, id: Ulid, title: &str, path: &str, started_at: DateTime<Utc>) -> IndexResult<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO meetings (id, title, path, started_at) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), title, path, started_at.to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn mark_ended(&self, id: Ulid, ended_at: DateTime<Utc>) -> IndexResult<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE meetings SET ended_at = ?1 WHERE id = ?2",
            params![ended_at.to_rfc3339(), id.to_string()],
        )?;
        Ok(())
    }

    pub fn recent(&self, limit: u32) -> IndexResult<Vec<MeetingRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, path, started_at, ended_at, peak FROM meetings ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |r| {
            Ok(MeetingRow {
                id: r.get::<_, String>(0)?,
                title: r.get(1)?,
                path: r.get(2)?,
                started_at: r.get(3)?,
                ended_at: r.get(4)?,
                peak: r.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MeetingRow {
    pub id: String,
    pub title: String,
    pub path: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub peak: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_query_roundtrip() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let idx = Index::open(tmp.path().to_path_buf()).unwrap();
        let id = Ulid::new();
        idx.insert_started(id, "Demo", "/tmp/x", Utc::now()).unwrap();
        let rows = idx.recent(10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Demo");
    }

    #[test]
    fn mark_ended_sets_ended_at() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let idx = Index::open(tmp.path().to_path_buf()).unwrap();
        let id = Ulid::new();
        idx.insert_started(id, "Demo", "/tmp/x", Utc::now()).unwrap();
        idx.mark_ended(id, Utc::now()).unwrap();
        let rows = idx.recent(10).unwrap();
        assert!(rows[0].ended_at.is_some());
    }
}
```

- [ ] **Step 2: Wire `Index` into `AppHandles`**

Modify `src-tauri/src/lib.rs`:
```rust
pub mod index_db;

pub struct AppHandles {
    pub capture: Arc<dyn platform::CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub session: Mutex<session::SessionState>,
    pub index: Arc<index_db::Index>,
}
```

In `run()`:
```rust
let handles = AppHandles {
    capture: build_capture(),
    storage: Arc::new(storage::Storage::default()),
    session: Mutex::new(session::SessionState::idle()),
    index: Arc::new(index_db::Index::open_default().expect("open meetings index")),
};
```

- [ ] **Step 3: Update `commands/session.rs` to use the index**

Inside `start_session`, after writing meeting.json, add:
```rust
state.index.insert_started(meeting_id, &resolved_title, &meeting_path.display().to_string(), now)
    .map_err(|e| e.to_string())?;
```

Inside `stop_session`, after `finalize_meeting_json`, add:
```rust
state.index.mark_ended(meeting_id, Utc::now()).map_err(|e| e.to_string())?;
```

- [ ] **Step 4: Add a `recent_meetings` command**

Add to `src-tauri/src/commands/windows.rs` (or a new `meetings.rs`; keep it simple here):
```rust
#[tauri::command]
pub async fn recent_meetings(state: State<'_, AppHandles>, limit: Option<u32>) -> Result<Vec<crate::index_db::MeetingRow>, String> {
    state.index.recent(limit.unwrap_or(20)).map_err(|e| e.to_string())
}
```

Register it in `commands/mod.rs`:
```rust
windows::recent_meetings,
```

- [ ] **Step 5: Run tests**

```bash
cd src-tauri && cargo test index_db::
cd src-tauri && cargo test
```

Expected: index_db tests PASS, full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/index_db.rs src-tauri/src/lib.rs src-tauri/src/commands
git commit -m "feat(index): SQLite meetings index with insert_started/mark_ended/recent"
```

---

## Task 12: Global hotkeys

**Files:**
- Create: `src-tauri/src/shortcuts.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write `src-tauri/src/shortcuts.rs`**

```rust
use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::AppHandles;

const START_STOP: &str = "Cmd+Shift+M";
const CAPTURE_NOW: &str = "Cmd+Shift+Space";

pub fn register_all<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let handle = app.clone();
    let gs = app.global_shortcut();
    gs.on_shortcut(START_STOP, move |h, _sc, ev| {
        if ev.state != ShortcutState::Pressed { return; }
        let h = h.clone();
        tauri::async_runtime::spawn(async move { toggle_session(h).await; });
    })?;
    let handle2 = app.clone();
    gs.on_shortcut(CAPTURE_NOW, move |h, _sc, ev| {
        if ev.state != ShortcutState::Pressed { return; }
        let h = h.clone();
        tauri::async_runtime::spawn(async move { trigger_capture(h).await; });
    })?;
    let _ = handle; let _ = handle2;
    Ok(())
}

async fn toggle_session<R: Runtime>(app: AppHandle<R>) {
    let state: tauri::State<AppHandles> = app.state();
    let current = state.session.lock().await.clone();
    match current {
        crate::session::SessionState::Recording { .. } => {
            if let Err(e) = crate::commands::session::stop_session(state).await {
                tracing::warn!("hotkey stop_session failed: {e}");
            }
        }
        crate::session::SessionState::Idle | crate::session::SessionState::Done { .. } => {
            // Opens the main window for user to pick a target.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
        _ => {}
    }
}

async fn trigger_capture<R: Runtime>(app: AppHandle<R>) {
    let state: tauri::State<AppHandles> = app.state();
    match crate::commands::capture::capture_manual(state).await {
        Ok(file) => tracing::info!("captured {file}"),
        Err(e) => tracing::warn!("capture_manual failed: {e}"),
    }
}
```

- [ ] **Step 2: Register in `lib.rs` setup hook**

```rust
.setup(|app| {
    tracing::info!("Moment starting, version {}", app.package_info().version);
    crate::shortcuts::register_all(&app.handle()).expect("global shortcuts");
    Ok(())
})
```

And `pub mod shortcuts;` near the other module declarations.

- [ ] **Step 3: Unit test — hotkey registration does not panic**

There is no deterministic way to trigger hotkeys inside unit tests, so we only assert registration compiles and the `on_shortcut` callbacks match the expected signature. Skip runtime tests; smoke-test covers it.

- [ ] **Step 4: Run `cargo check`**

```bash
cd src-tauri && cargo check
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs
git commit -m "feat(shortcuts): register Cmd+Shift+M and Cmd+Shift+Space"
```

---

## Task 13: Menu bar icon + popover

**Files:**
- Modify: `src-tauri/src/lib.rs` — build tray menu
- Create: `src/components/MenuBarPopover.tsx` (rendered in `App.tsx` when `window.__MOMENT_MODE__ === "popover"`)

- [ ] **Step 1: Extend `lib.rs` setup to build the tray menu**

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

.setup(|app| {
    tracing::info!("Moment starting, version {}", app.package_info().version);
    crate::shortcuts::register_all(&app.handle())?;

    let menu = Menu::with_items(app, &[
        &MenuItem::with_id(app, "open", "Open Moment…", true, None::<&str>)?,
        &MenuItem::with_id(app, "start_stop", "Start / Stop Recording", true, None::<&str>)?,
        &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
    ])?;

    TrayIconBuilder::with_id("moment-tray")
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "quit" => app.exit(0),
                "open" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "start_stop" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        crate::shortcuts::hotkey_toggle(app).await;
                    });
                }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
})
```

Also expose `shortcuts::hotkey_toggle` as a `pub async fn` that reuses `toggle_session`.

- [ ] **Step 2: Write `src/components/MenuBarPopover.tsx`**

```tsx
import { useEffect, useState } from "react";
import { tauri, type SessionState, type WindowInfo } from "../api/tauri";

export function MenuBarPopover() {
  const [state, setState] = useState<SessionState>({ kind: "idle" });
  const [windows, setWindows] = useState<WindowInfo[]>([]);

  useEffect(() => {
    tauri.sessionState().then(setState).catch(console.error);
    const t = setInterval(() => tauri.sessionState().then(setState).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, []);

  const refreshWindows = () => tauri.getWindows().then(setWindows).catch(console.error);

  return (
    <div style={{ padding: 12, width: 360, fontFamily: "system-ui" }}>
      <h2 style={{ margin: 0 }}>Moment</h2>
      <p>Status: <strong>{state.kind}</strong></p>

      {state.kind === "recording" && (
        <>
          <p>Meeting <code>{state.meetingId.slice(0, 8)}</code> since {new Date(state.startedAt).toLocaleTimeString()}</p>
          <button onClick={() => tauri.stopSession().then(setState)}>Stop recording</button>
          <button onClick={() => tauri.captureManual()}>Capture now</button>
        </>
      )}

      {state.kind !== "recording" && (
        <>
          <button onClick={refreshWindows}>Refresh windows</button>
          <ul>
            {windows.map(w => (
              <li key={w.id}>
                <button onClick={() => tauri.startSession(w.id, w.title).then(setState)}>
                  {w.app}: {w.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the popover in `App.tsx`**

Replace `src/App.tsx`:
```tsx
import { MenuBarPopover } from "./components/MenuBarPopover";

export default function App() {
  return <MenuBarPopover />;
}
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src/components/MenuBarPopover.tsx src/App.tsx
git commit -m "feat(ui): menu bar tray + popover with window picker and session controls"
```

---

## Task 14: Permission gate on first run

**Files:**
- Create: `src/components/PermissionGate.tsx`
- Modify: `src/App.tsx` to render the gate when screen recording is not granted

- [ ] **Step 1: Write `src/components/PermissionGate.tsx`**

```tsx
import { useEffect, useState } from "react";
import { tauri } from "../api/tauri";

export function PermissionGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"unknown" | "granted" | "denied">("unknown");

  useEffect(() => {
    tauri.grantedPermissions().then(p => setStatus(p.screen ? "granted" : "denied")).catch(() => setStatus("denied"));
  }, []);

  if (status === "granted") return <>{children}</>;

  return (
    <div style={{ padding: 16 }}>
      <h3>Screen recording permission needed</h3>
      <p>Moment captures the window you pick. macOS requires explicit permission in System Settings.</p>
      <button onClick={() => tauri.openScreenRecordingPrefs()}>Open System Settings</button>
      <button onClick={() => tauri.grantedPermissions().then(p => setStatus(p.screen ? "granted" : "denied"))}>
        I&apos;ve granted it
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wrap the popover**

```tsx
import { MenuBarPopover } from "./components/MenuBarPopover";
import { PermissionGate } from "./components/PermissionGate";

export default function App() {
  return (
    <PermissionGate>
      <MenuBarPopover />
    </PermissionGate>
  );
}
```

- [ ] **Step 3: Add a React component test**

`src/components/PermissionGate.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, vi, expect, beforeEach } from "vitest";

vi.mock("../api/tauri", () => ({
  tauri: {
    grantedPermissions: vi.fn(),
    openScreenRecordingPrefs: vi.fn(),
  },
}));

import { tauri } from "../api/tauri";
import { PermissionGate } from "./PermissionGate";

describe("PermissionGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders children when screen recording is granted", async () => {
    (tauri.grantedPermissions as any).mockResolvedValue({ screen: true });
    render(<PermissionGate><div>INSIDE</div></PermissionGate>);
    await waitFor(() => expect(screen.getByText("INSIDE")).toBeInTheDocument());
  });

  it("shows the prompt when denied", async () => {
    (tauri.grantedPermissions as any).mockResolvedValue({ screen: false });
    render(<PermissionGate><div>INSIDE</div></PermissionGate>);
    await waitFor(() => expect(screen.getByText(/Open System Settings/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run the UI tests**

```bash
npm run test:run
```

Expected: PermissionGate tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/App.tsx
git commit -m "feat(ui): permission gate with deep-link to Screen Recording settings"
```

---

## Task 15: Notification on capture

**Files:**
- Modify: `src-tauri/src/commands/capture.rs` — fire Tauri notification after save

- [ ] **Step 1: Extend `capture_manual` to emit a notification**

Wrap the end of `capture_manual`:
```rust
use tauri_plugin_notification::NotificationExt;

// ... after append_screenshot succeeds
if let Some(app) = state.app_handle.as_ref() {
    let _ = app.notification().builder()
        .title("Moment")
        .body(format!("Captured {}", file))
        .show();
}
Ok(file)
```

This requires `AppHandles` to carry an `app_handle: Option<tauri::AppHandle>`. Capture it in the `setup` hook:

In `lib.rs`:
```rust
pub struct AppHandles {
    pub capture: Arc<dyn platform::CaptureBackend>,
    pub storage: Arc<storage::Storage>,
    pub session: Mutex<session::SessionState>,
    pub index: Arc<index_db::Index>,
    pub app_handle: std::sync::OnceLock<tauri::AppHandle>,
}
```

Init with `std::sync::OnceLock::new()` in the ctor.

In `setup`:
```rust
let handle = app.handle().clone();
let _ = app.state::<AppHandles>().app_handle.set(handle);
```

Adjust `capture_manual` to reach into `state.app_handle.get()`.

- [ ] **Step 2: Verify compile**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src
git commit -m "feat(notification): toast on successful manual capture"
```

---

## Task 16: Smoke test and README refresh

**Files:**
- Create: `docs/user/SMOKE.md`
- Modify: `README.md` (top-level) — replace content for standalone app

- [ ] **Step 1: Write `docs/user/SMOKE.md`**

```markdown
# M1 Smoke Test

## Prereqs
- macOS 12.3+ (Intel or Apple Silicon)
- Moment.app running via `npm run tauri dev` OR a dev build at `src-tauri/target/debug/bundle/macos/Moment.app`
- Screen Recording permission granted to the host terminal or to the built `.app`

## Steps
1. Launch the app. Menu bar shows the Moment tray icon.
2. Open a Zoom/Meet/Teams meeting (solo testing: start an instant Zoom meeting by yourself).
3. Click tray → Open Moment. The main window lists visible windows.
4. Click the Zoom window in the list. The status switches to "recording".
5. Press ⌘⇧Space. A notification appears: "Captured screenshots/…png".
6. Repeat ⌘⇧Space a few times.
7. Press ⌘⇧M. The status switches to "done".
8. Open Finder at `~/Moment/`. A folder named `YYYY-MM-DD HH-mm <title>` exists and contains:
   - `screenshots/*.png` (one per hotkey press)
   - `meeting.json` with `schemaVersion: 1`, matching `id`, `events: [{kind: "start"}, {kind: "manual_capture"}*, {kind: "end"}]`, and `ended_at` populated.
9. Open `~/Library/Application Support/Moment/meetings.sqlite` with `sqlite3` and run `SELECT * FROM meetings ORDER BY started_at DESC LIMIT 5;`. The just-finished meeting appears with `ended_at` filled in.

## Pass criteria
- All of steps 1–9 succeed without error in the app log (`RUST_LOG=debug npm run tauri dev`).
- No Gatekeeper warnings during the dev run.
- PNG files open in Preview and show the actual Zoom window (not black/empty).
```

- [ ] **Step 2: Rewrite `README.md`**

```markdown
# Moment

**Local macOS app that archives the best moments of your meetings.**

Moment is a standalone menubar app that captures screenshots during any meeting
(Zoom, Google Meet, Microsoft Teams, Jitsi, Whereby — any visible window) and
builds a local interactive archive: gallery, transcript, AI summary, notes —
all on-device.

> Status: **M1 — Capture Foundation**. Window picker + manual capture work end to end. Peak detection, audio, transcript, and AI summary land in M2–M4. Track progress in `docs/superpowers/plans/`.

## How it works (M1)

1. Pick a visible window (Zoom, Meet, or anything else) from the menubar popover.
2. Press ⌘⇧Space to capture a PNG of that window at any moment.
3. Press ⌘⇧M to end the session; a `meeting.json` is written alongside the screenshots.

All data is stored locally in `~/Moment/<meeting>/`. The meetings index lives at
`~/Library/Application Support/Moment/meetings.sqlite`.

## Stack

- Tauri 2 + React 18 + TypeScript
- Rust core with trait-based platform abstraction (`CaptureBackend`, …)
- macOS: ScreenCaptureKit via `screencapturekit` crate
- SQLite for the meetings index

## Development

Requires macOS 12.3+, Rust 1.80+, Node 22+, Xcode Command Line Tools.

```bash
git clone https://github.com/eduftf/moment.git
cd moment
npm install
npm run tauri dev
```

First launch will prompt for Screen Recording permission. Grant it in
**System Settings → Privacy & Security → Screen Recording** and re-open the app.

## Tests

```bash
cd src-tauri && cargo test
cd .. && npm run test:run
```

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M1 | Capture Foundation — window picker + manual capture | ✅ |
| M2 | Peak detection via Swift sidecar + Vision framework | ⏳ |
| M3 | Audio capture + on-device transcript (SFSpeechRecognizer) | ⏳ |
| M4 | AI summary + action items (Foundation Models) | ⏳ |
| M5 | Interactive dashboard (React gallery + transcript + summary + notes) | ⏳ |
| M6 | Ad-hoc signed DMG, GitHub Releases workflow, landing refresh | ⏳ |
| M7 | Platform abstraction polish, community onboarding docs | ⏳ |

Community PRs welcome for Windows and Linux platform impls — see the
`CaptureBackend`/`VisionBackend`/`SpeechBackend`/`LlmBackend` traits.

## License

MIT.

## Legacy

The original Zoom App + Companion architecture is archived under `legacy/`.
It is frozen and read-only. Do not add features there.
```

- [ ] **Step 3: Manually execute the smoke test**

Follow `docs/user/SMOKE.md` end to end. Do not proceed if any step fails.

- [ ] **Step 4: Commit**

```bash
git add docs/user/SMOKE.md README.md
git commit -m "docs(m1): smoke test checklist and README for standalone pivot"
```

---

## M1 Exit Criteria

- [ ] `cargo test` passes in `src-tauri/`.
- [ ] `npm run test:run` passes at repo root.
- [ ] SMOKE.md steps 1–9 pass on a developer Mac.
- [ ] `~/Moment/<meeting>/screenshots/*.png` contains real window pixels (not black frames).
- [ ] `meetings.sqlite` has a row for the test meeting with `ended_at` set.
- [ ] `legacy/zoom-app/` and `legacy/companion/` present and untouched since Task 1.
- [ ] Tauri dev run produces no panics and no uncaught promise rejections in the web console.

When all boxes are ticked, write the M2 plan (`2026-04-17-moment-m2-peak-detection.md`) — it introduces the Swift AI sidecar and Vision-based face counting.

---

## Appendix A — Commit Convention

All commits use conventional-commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`) with a scope in parentheses. Subject line ≤ 72 chars. Body may be multi-line. All commits authored by the implementing engineer, with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` when the engineer is Claude.

## Appendix B — Known Sharp Edges

- `screencapturekit` 0.3 API names may shift; the test for `list_windows` is the authoritative contract — adapt implementation to keep the test passing.
- `sips` + `iconutil` in Task 2 Step 3 are quick icon generators; if the source PNG from `legacy/zoom-app/public/favicon.png` is missing, substitute any 512×512 PNG.
- `OnceLock<AppHandle>` in Task 15 is pragmatic, not elegant; refactor during M5 when more Tauri integration needs it.
- Tauri 2 tray icon template mode (`iconAsTemplate`) expects a monochrome PNG; colored icon will still show but looks out of place in the menubar.
