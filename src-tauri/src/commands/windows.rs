use tauri::State;
use crate::platform::WindowInfo;
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
