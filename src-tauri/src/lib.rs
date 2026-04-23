use std::sync::Arc;
use tauri::Manager;
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
    pub vision: Arc<dyn VisionBackend>,
    pub sidecar: Arc<Supervisor>,
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

/// Resolve the path to the Swift sidecar binary.
///
/// In dev we bake the `CARGO_MANIFEST_DIR` path — `scripts/build-sidecar.sh`
/// drops the binary under `src-tauri/binaries/moment-ai-sidecar-<triple>`.
/// In a bundled `.app` Tauri copies the binary to `Contents/MacOS/` via the
/// `externalBin` config — that path will be wired in M6.
fn resolve_sidecar_path() -> std::path::PathBuf {
    let triple = std::env::var("TARGET").unwrap_or_else(|_| {
        let arch = std::env::consts::ARCH;
        format!("{arch}-apple-darwin")
    });
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("moment-ai-sidecar-{triple}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info,moment=debug".into()))
        .init();

    let index = index_db::Index::open_default()
        .expect("failed to open meetings index — check ~/Library/Application Support/Moment/ permissions");

    // Boot the sidecar on a one-shot current-thread runtime. Tauri hasn't
    // installed its own runtime yet, and this path runs exactly once per
    // process — a dedicated runtime keeps us independent of the future
    // runtime choice inside `.run()`.
    let sidecar_path = resolve_sidecar_path();
    tracing::info!("sidecar path: {}", sidecar_path.display());
    // Multi-thread runtime: the Supervisor spawns reader/stdin tasks via
    // `tokio::spawn`, and on a single-threaded scheduler those can starve
    // the outer `block_on` future because cooperative yielding doesn't
    // give stdio tasks a wake-up until the outer task returns to `await`
    // more than a brief pacing sleep. A dedicated multi-thread runtime
    // avoids the issue entirely and still keeps us out of the `futures`
    // crate.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("failed to build sidecar bootstrap runtime");
    let sidecar = rt
        .block_on(async { Supervisor::spawn(sidecar_path).await })
        .expect("sidecar spawn failed — did scripts/build-sidecar.sh run?");
    tracing::info!("sidecar ready: state={:?}", sidecar.state());

    let vision: Arc<dyn VisionBackend> = {
        #[cfg(target_os = "macos")]
        { Arc::new(platform::macos::MacosVision::new(sidecar.clone())) }
        #[cfg(not(target_os = "macos"))]
        { compile_error!("non-macOS builds have no VisionBackend in M2"); }
    };

    let handles = AppHandles {
        capture: build_capture(),
        vision: vision.clone(),
        sidecar: sidecar.clone(),
        storage: Arc::new(storage::Storage::default()),
        index: Arc::new(index),
        session: tokio::sync::Mutex::new(session::SessionState::idle()),
    };

    commands::register(
        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .manage(handles)
    )
    .setup(|app| {
        tracing::info!("Moment starting, version {}", app.package_info().version);
        tray::setup(app.handle())?;

        // Kick off peak detection on Tauri's runtime so it shares the app
        // lifecycle. Real logic lands in Task 8.
        let state: tauri::State<AppHandles> = app.state();
        let vision_for_peak = state.vision.clone();
        let capture_for_peak = state.capture.clone();
        let storage_for_peak = state.storage.clone();
        let index_for_peak = state.index.clone();
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            peak::PeakDetector::new(
                vision_for_peak,
                capture_for_peak,
                storage_for_peak,
                index_for_peak,
                app_handle,
            )
            .run()
            .await;
        });

        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
