use chrono::Utc;
use tauri::State;

use crate::session::SessionState;
use crate::storage::ScreenshotEntry;
use crate::AppHandles;

#[tauri::command]
pub async fn capture_manual(state: State<'_, AppHandles>) -> Result<String, String> {
    // Snapshot the session state under lock, then release before the slow capture_window call.
    // Capturing while holding the lock would block session_state() / stop_session() for 1-5s.
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
        .map_err(|_| "capture wrote outside meeting dir".to_string())?
        .display()
        .to_string();

    state.storage.append_screenshot(
        &meeting_path,
        ScreenshotEntry { file: file.clone(), trigger: "manual".into(), at: Utc::now() },
    ).map_err(|e| e.to_string())?;

    Ok(file)
}
