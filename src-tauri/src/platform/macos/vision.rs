#![cfg(target_os = "macos")]

use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use crate::platform::{PlatformError, PlatformResult, VisionAvailability, VisionBackend};
use crate::sidecar::Supervisor;

/// `MacosVision` delegates Vision-framework ops to the Swift sidecar via
/// `Supervisor`. It owns no state beyond an Arc to the supervisor — one
/// instance is shared across the whole app.
pub struct MacosVision {
    supervisor: Arc<Supervisor>,
}

impl MacosVision {
    pub fn new(supervisor: Arc<Supervisor>) -> Self {
        Self { supervisor }
    }
}

#[async_trait]
impl VisionBackend for MacosVision {
    async fn count_faces(&self, frame_path: &Path) -> PlatformResult<usize> {
        let args = json!({ "image_path": frame_path.to_string_lossy() });
        let result = self
            .supervisor
            .request("count_faces", Some(args))
            .await
            .map_err(|e| PlatformError::Backend(format!("sidecar count_faces: {e}")))?;

        let faces = result
            .get("faces")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| {
                PlatformError::Backend(format!(
                    "sidecar count_faces returned unexpected shape: {result}"
                ))
            })?;

        Ok(faces as usize)
    }

    async fn availability(&self) -> VisionAvailability {
        let result = match self.supervisor.request("availability", None).await {
            Ok(v) => v,
            Err(e) => {
                return VisionAvailability::Unavailable {
                    reason: format!("{e}"),
                };
            }
        };

        match result.get("vision").and_then(|v| v.as_str()) {
            Some("available") => VisionAvailability::Available,
            Some(other) => VisionAvailability::Unavailable {
                reason: format!("sidecar reports vision={other}"),
            },
            None => VisionAvailability::Unavailable {
                reason: format!("sidecar availability missing vision field: {result}"),
            },
        }
    }
}
