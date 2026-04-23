//! Peak detection task scaffold.
//!
//! The real implementation lands in Task 8 of the M2 plan. For now this
//! module exposes a zero-sized stub whose `run()` is a no-op so `lib.rs`
//! can wire the spawn site and prove the trait plumbing compiles.

use std::sync::Arc;

use tauri::{AppHandle, Runtime};

use crate::index_db::Index;
use crate::platform::{CaptureBackend, VisionBackend};
use crate::storage::Storage;

pub struct PeakDetector;

impl PeakDetector {
    pub fn new<R: Runtime>(
        _vision: Arc<dyn VisionBackend>,
        _capture: Arc<dyn CaptureBackend>,
        _storage: Arc<Storage>,
        _index: Arc<Index>,
        _app: AppHandle<R>,
    ) -> Self {
        Self
    }

    pub async fn run(self) {
        // Real logic lands in Task 8.
    }
}
