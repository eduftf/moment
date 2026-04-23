use std::path::PathBuf;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PlatformError {
    #[error("unsupported on this platform")]
    Unsupported,
    #[error("permission denied: {0}")]
    PermissionDenied(&'static str),
    #[error("window not found: {0}")]
    WindowNotFound(WindowId),
    #[error("backend error: {0}")]
    Backend(String),
}

pub type PlatformResult<T> = Result<T, PlatformError>;

pub type WindowId = u64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WindowInfo {
    pub id: WindowId,
    pub title: String,
    pub app: String,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub png_path: PathBuf,
    pub captured_at: chrono::DateTime<chrono::Utc>,
}

#[async_trait]
pub trait CaptureBackend: Send + Sync {
    async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>>;
    async fn capture_window(&self, id: WindowId, dest_dir: &std::path::Path) -> PlatformResult<Frame>;
    async fn screen_recording_granted(&self) -> bool;
}

#[derive(Debug, Clone)]
pub enum VisionAvailability {
    Available,
    Unavailable { reason: String },
}

#[async_trait]
pub trait VisionBackend: Send + Sync {
    async fn count_faces(&self, frame_path: &std::path::Path) -> PlatformResult<usize>;
    async fn availability(&self) -> VisionAvailability;
}

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_error_display_is_stable() {
        let e = PlatformError::PermissionDenied("screen_recording");
        assert_eq!(e.to_string(), "permission denied: screen_recording");
    }

    #[test]
    fn window_info_roundtrips_json() {
        let w = WindowInfo {
            id: 42,
            title: "Zoom Meeting".into(),
            app: "zoom.us".into(),
            bounds: Bounds { x: 0.0, y: 0.0, width: 1200.0, height: 800.0 },
        };
        let j = serde_json::to_string(&w).unwrap();
        let back: WindowInfo = serde_json::from_str(&j).unwrap();
        assert_eq!(w, back);
    }
}
