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
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
