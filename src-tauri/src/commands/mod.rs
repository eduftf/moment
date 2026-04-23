pub mod capture;
pub mod session;
pub mod windows;

use tauri::Runtime;

pub fn register<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        capture::capture_manual,
        windows::get_windows,
        windows::granted_permissions,
        windows::open_screen_recording_prefs,
        session::start_session,
        session::stop_session,
        session::session_state,
        session::get_recent_meetings,
    ])
}
