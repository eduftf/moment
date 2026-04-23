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
    // Fix 1: Call list_windows BEFORE acquiring the session lock.
    // SCShareableContent can block 1–3 s on first call; holding the mutex
    // across that await would freeze concurrent session_state() reads.
    let windows = state.capture.list_windows().await.map_err(|e| e.to_string())?;
    let window = windows
        .into_iter()
        .find(|w| w.id == window_id)
        .ok_or_else(|| format!("window {} not found", window_id))?;

    // Acquire lock only after the slow async call completes.
    let mut guard = state.session.lock().await;

    // Fix 1 (double-check): another concurrent start_session may have won
    // the race while we were awaiting list_windows.
    if guard.is_recording() {
        return Err("a session is already recording".into());
    }

    let meeting_id = Ulid::new();
    let now = Utc::now();
    let resolved_title = title.unwrap_or_else(|| window.title.clone());

    // Fix 2: perform both storage ops BEFORE mutating the guard.
    // If either fails, the guard stays Idle and the error propagates cleanly.
    // (The empty meeting dir left behind on write_meeting_json failure is
    // acceptable for M1; cleanup is out-of-scope.)
    let meeting_path = state
        .storage
        .create_meeting_dir(&resolved_title, now)
        .map_err(|e| e.to_string())?;
    state
        .storage
        .write_meeting_json(&meeting_path, meeting_id, &resolved_title, window_id, now)
        .map_err(|e| e.to_string())?;

    // Only now transition state — both storage ops succeeded.
    *guard = SessionState::Recording {
        meeting_id,
        window_id,
        started_at: now,
        title: resolved_title,
        path: meeting_path.display().to_string(),
    };

    // Update the meetings index. Failures are non-fatal: the meeting folder
    // on disk is the source of truth, the SQLite index is only a cache for
    // fast listing. Warn and continue so the session stays recording.
    if let SessionState::Recording { meeting_id, started_at, title, path, .. } = &*guard {
        if let Err(e) = state.index.insert_started(
            *meeting_id,
            title,
            path,
            *started_at,
        ) {
            tracing::warn!("index insert_started failed: {e} — meeting folder is still source of truth");
        }
    }

    Ok(guard.clone())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    let mut guard = state.session.lock().await;

    // Fix 3: guard against re-entrant calls on Done/Finalizing sessions.
    // meeting_id() returns Some for Recording AND Done, so the old check
    // silently allowed stop_session on an already-finished session.
    if !guard.is_recording() {
        return Err("no active recording session".into());
    }
    // Safe to unwrap: is_recording() implies meeting_id is Some.
    let meeting_id = guard.meeting_id().expect("is_recording implies meeting_id");

    if let SessionState::Recording { path, .. } = guard.clone() {
        state
            .storage
            .finalize_meeting_json(std::path::Path::new(&path), Utc::now())
            .map_err(|e| e.to_string())?;
    }
    *guard = SessionState::Done { meeting_id };

    // Update the meetings index. Non-fatal: meeting.json on disk already has
    // ended_at set; the SQLite row is only for fast listing.
    if let SessionState::Done { meeting_id, .. } = &*guard {
        if let Err(e) = state.index.mark_ended(*meeting_id, Utc::now()) {
            tracing::warn!("index mark_ended failed: {e}");
        }
    }

    Ok(guard.clone())
}

#[tauri::command]
pub async fn session_state(state: State<'_, AppHandles>) -> Result<SessionState, String> {
    Ok(state.session.lock().await.clone())
}
