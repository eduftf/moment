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

    commands::register(
        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .manage(handles)
    )
    .setup(|app| {
        tracing::info!("Moment starting, version {}", app.package_info().version);
        tray::setup(app.handle())?;
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
