use tauri::{AppHandle, Runtime};

/// Tray initialisation. Real implementation lands in Task 12; this placeholder
/// keeps `lib.rs` compiling until then.
pub fn setup<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}
