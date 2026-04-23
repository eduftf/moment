//! Peak detection task.
//!
//! Runs every `TICK` seconds while the session is `Recording`. Captures the
//! meeting window, asks the Vision sidecar to count faces, and promotes a
//! new peak when two consecutive frames sustain a higher face count than the
//! current max. On promotion a `*_peak-N.png` screenshot is copied alongside
//! the manual screenshots and the SQLite `peak` column is bumped.
//!
//! Silent by design: no user notification on peak capture (spec §15).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Manager, Runtime};
use ulid::Ulid;

use crate::index_db::Index;
use crate::platform::{CaptureBackend, VisionBackend};
use crate::session::SessionState;
use crate::storage::{ScreenshotEntry, Storage};

const TICK: Duration = Duration::from_secs(3);
const WARMUP_SECS: i64 = 120;

#[derive(Debug, Default, Clone)]
struct PeakState {
    max: usize,
    candidate: usize,
}

impl PeakState {
    fn observe(&mut self, faces: usize) -> Option<usize> {
        if faces > self.max && faces == self.candidate {
            self.max = faces;
            Some(faces)
        } else {
            self.candidate = faces;
            None
        }
    }
}

pub struct PeakDetector<R: Runtime> {
    vision: Arc<dyn VisionBackend>,
    capture: Arc<dyn CaptureBackend>,
    storage: Arc<Storage>,
    index: Arc<Index>,
    app: AppHandle<R>,
}

impl<R: Runtime> PeakDetector<R> {
    pub fn new(
        vision: Arc<dyn VisionBackend>,
        capture: Arc<dyn CaptureBackend>,
        storage: Arc<Storage>,
        index: Arc<Index>,
        app: AppHandle<R>,
    ) -> Self {
        Self { vision, capture, storage, index, app }
    }

    pub async fn run(self) {
        let mut current: Option<(Ulid, PeakState)> = None;
        let peak_scratch_dir =
            PathBuf::from(format!("/tmp/moment-peak-{}", std::process::id()));
        if let Err(e) = std::fs::create_dir_all(&peak_scratch_dir) {
            tracing::warn!(
                "peak: cannot create scratch dir {}: {e}",
                peak_scratch_dir.display()
            );
            // Loop can still run; capture will fail and tick will skip.
        }

        loop {
            tokio::time::sleep(TICK).await;

            let handles: tauri::State<crate::AppHandles> = self.app.state();
            let snapshot = handles.session.lock().await.clone();

            let (meeting_id, window_id, started_at, path) = match snapshot {
                SessionState::Recording {
                    meeting_id,
                    window_id,
                    started_at,
                    path,
                    ..
                } => (meeting_id, window_id, started_at, path),
                _ => {
                    current = None;
                    continue;
                }
            };

            if (Utc::now() - started_at).num_seconds() < WARMUP_SECS {
                continue;
            }

            let state = match &mut current {
                Some((id, st)) if *id == meeting_id => st,
                _ => {
                    current = Some((meeting_id, PeakState::default()));
                    &mut current.as_mut().unwrap().1
                }
            };

            // Capture into scratch dir; backend names the file.
            let frame = match self
                .capture
                .capture_window(window_id, &peak_scratch_dir)
                .await
            {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!("peak: capture_window failed: {e}");
                    continue;
                }
            };

            let faces = match self.vision.count_faces(&frame.png_path).await {
                Ok(n) => n,
                Err(e) => {
                    tracing::warn!("peak: count_faces failed: {e}");
                    continue;
                }
            };

            if let Some(peak_count) = state.observe(faces) {
                let meeting_path = std::path::Path::new(&path).to_path_buf();
                let screenshots_dir = meeting_path.join("screenshots");
                if let Err(e) = std::fs::create_dir_all(&screenshots_dir) {
                    tracing::warn!("peak: mkdir screenshots: {e}");
                    continue;
                }

                let ts = Utc::now().format("%Y-%m-%d_%H-%M-%S");
                let dest = screenshots_dir.join(format!("{ts}_peak-{peak_count}.png"));
                if let Err(e) = std::fs::copy(&frame.png_path, &dest) {
                    tracing::warn!("peak: copy frame to screenshots dir failed: {e}");
                    continue;
                }

                let file_rel = dest
                    .strip_prefix(&meeting_path)
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| dest.display().to_string());

                let entry = ScreenshotEntry {
                    file: file_rel,
                    trigger: "peak".into(),
                    at: Utc::now(),
                };
                if let Err(e) = self.storage.append_screenshot(&meeting_path, entry) {
                    tracing::warn!("peak: append_screenshot failed: {e}");
                    continue;
                }
                if let Err(e) = self.index.update_peak(meeting_id, peak_count as i64) {
                    tracing::warn!("peak: index update_peak failed: {e}");
                }
                tracing::info!("peak: promoted to {peak_count}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_promote_on_zero_faces() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(0), None);
        assert_eq!(s.observe(0), None);
        assert_eq!(s.max, 0);
    }

    #[test]
    fn single_frame_spike_does_not_promote() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(3), None); // candidate set to 3
        assert_eq!(s.observe(0), None); // sustain failed, reset
        assert_eq!(s.max, 0);
    }

    #[test]
    fn two_frame_sustain_promotes() {
        let mut s = PeakState::default();
        assert_eq!(s.observe(4), None);    // candidate = 4
        assert_eq!(s.observe(4), Some(4)); // sustained: promote
        assert_eq!(s.max, 4);
    }

    #[test]
    fn no_promote_when_below_current_max() {
        let mut s = PeakState { max: 5, candidate: 5 };
        assert_eq!(s.observe(3), None);
        assert_eq!(s.observe(3), None);
        assert_eq!(s.max, 5);
    }

    #[test]
    fn sustained_new_higher_max_promotes() {
        let mut s = PeakState { max: 3, candidate: 3 };
        assert_eq!(s.observe(5), None);
        assert_eq!(s.observe(5), Some(5));
        assert_eq!(s.max, 5);
    }
}
