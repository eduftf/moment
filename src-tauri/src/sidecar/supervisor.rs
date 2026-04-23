use std::sync::Arc;
use dashmap::DashMap;
use tokio::sync::{mpsc, oneshot};

use crate::sidecar::protocol::Request;
use crate::sidecar::state::{SidecarState, SidecarStateCell};

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("sidecar unavailable: {0:?}")]
    Unavailable(SidecarState),
    #[error("request timed out after {0:?}")]
    Timeout(std::time::Duration),
    #[error("sidecar error: {code} — {message}")]
    Remote { code: String, message: String },
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub type SupervisorResult<T> = Result<T, SupervisorError>;

pub struct Supervisor {
    pub(super) state: Arc<SidecarStateCell>,
    pub(super) tx: mpsc::Sender<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
    pub(super) pending: Arc<DashMap<String, oneshot::Sender<SupervisorResult<serde_json::Value>>>>,
}

impl Supervisor {
    pub fn state(&self) -> SidecarState {
        self.state.load()
    }

    pub async fn request(&self, _op: &str, _args: Option<serde_json::Value>) -> SupervisorResult<serde_json::Value> {
        unimplemented!("Task 5 provides the real implementation")
    }
}
