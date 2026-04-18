use chrono::Utc;
use tauri::State;
use ulid::Ulid;

use crate::platform::WindowId;
use crate::session::SessionState;
use crate::AppHandles;

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

    let windows = state.capture.list_windows().await.map_err(|e| e.to_string())?;
    let window = windows
        .into_iter()
        .find(|w| w.id == window_id)
        .ok_or_else(|| format!("window {} not found", window_id))?;

    let meeting_id = Ulid::new();
    let now = Utc::now();
    let resolved_title = title.unwrap_or_else(|| window.title.clone());
    let meeting_path = state
        .storage
        .create_meeting_dir(&resolved_title, now)
        .map_err(|e| e.to_string())?;

    *guard = SessionState::Recording {
        meeting_id,
        window_id,
        started_at: now,
        title: resolved_title.clone(),
        path: meeting_path.display().to_string(),
    };
    state
        .storage
        .write_meeting_json(&meeting_path, meeting_id, &resolved_title, window_id, now)
        .map_err(|e| e.to_string())?;

    Ok(guard.clone())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    let mut guard = state.session.lock().await;
    let meeting_id = guard
        .meeting_id()
        .ok_or_else(|| "no active session".to_string())?;
    if let SessionState::Recording { path, .. } = guard.clone() {
        state
            .storage
            .finalize_meeting_json(std::path::Path::new(&path), Utc::now())
            .map_err(|e| e.to_string())?;
    }
    *guard = SessionState::Done { meeting_id };
    Ok(guard.clone())
}

#[tauri::command]
pub async fn session_state(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    Ok(state.session.lock().await.clone())
}
