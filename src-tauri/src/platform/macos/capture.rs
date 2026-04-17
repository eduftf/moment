#![cfg(target_os = "macos")]

use std::path::Path;

use async_trait::async_trait;
use screencapturekit::shareable_content::SCShareableContent;

use crate::platform::{
    Bounds, CaptureBackend, Frame, PlatformError, PlatformResult, WindowId, WindowInfo,
};

pub struct MacosCapture;

impl MacosCapture {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CaptureBackend for MacosCapture {
    async fn list_windows(&self) -> PlatformResult<Vec<WindowInfo>> {
        let content = tokio::task::spawn_blocking(|| {
            SCShareableContent::get().map_err(|e| PlatformError::Backend(e.to_string()))
        })
        .await
        .map_err(|e| PlatformError::Backend(e.to_string()))??;

        let windows = content
            .windows()
            .into_iter()
            .filter(|w| w.is_on_screen() && !w.title().is_empty())
            .map(|w| {
                let frame = w.get_frame();
                WindowInfo {
                    id: w.window_id() as WindowId,
                    title: w.title(),
                    app: w.owning_application().application_name(),
                    bounds: Bounds {
                        x: frame.origin.x as f64,
                        y: frame.origin.y as f64,
                        width: frame.size.width as f64,
                        height: frame.size.height as f64,
                    },
                }
            })
            .collect();

        Ok(windows)
    }

    async fn capture_window(&self, _id: WindowId, _dest_dir: &Path) -> PlatformResult<Frame> {
        Err(PlatformError::Unsupported) // implemented in Task 6
    }

    async fn screen_recording_granted(&self) -> bool {
        use core_graphics::access::ScreenCaptureAccess;
        ScreenCaptureAccess::default().preflight()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn list_windows_returns_at_least_one_on_a_normal_desktop() {
        let cap = MacosCapture::new();
        let windows = cap.list_windows().await.expect("list_windows");
        if std::env::var("CI").is_ok() {
            eprintln!("skipping list_windows assertion on CI");
            return;
        }
        assert!(!windows.is_empty(), "expected at least one visible titled window");
        for w in windows {
            assert!(w.bounds.width > 0.0);
            assert!(w.bounds.height > 0.0);
        }
    }
}
