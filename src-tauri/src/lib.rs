use std::sync::Arc;
use crate::platform::CaptureBackend;

pub mod platform;
pub mod storage;
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
