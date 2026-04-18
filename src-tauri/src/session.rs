use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::platform::WindowId;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum SessionState {
    Idle,
    Selecting,
    Recording {
        meeting_id: Ulid,
        window_id: WindowId,
        started_at: DateTime<Utc>,
        title: String,
        path: String,
    },
    Finalizing { meeting_id: Ulid },
    Done { meeting_id: Ulid },
}

impl SessionState {
    pub fn idle() -> Self {
        Self::Idle
    }

    pub fn is_recording(&self) -> bool {
        matches!(self, Self::Recording { .. })
    }

    pub fn meeting_id(&self) -> Option<Ulid> {
        match self {
            Self::Recording { meeting_id, .. }
            | Self::Finalizing { meeting_id }
            | Self::Done { meeting_id } => Some(*meeting_id),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_is_not_recording() {
        assert!(!SessionState::idle().is_recording());
    }

    #[test]
    fn recording_reports_meeting_id() {
        let id = Ulid::new();
        let s = SessionState::Recording {
            meeting_id: id,
            window_id: 1,
            started_at: Utc::now(),
            title: "t".into(),
            path: "/tmp/m".into(),
        };
        assert_eq!(s.meeting_id(), Some(id));
        assert!(s.is_recording());
    }

    #[test]
    fn recording_serializes_camel_case_fields() {
        // CRITICAL: JS-side type uses camelCase (meetingId, windowId, startedAt).
        // Rust uses snake_case. The serde `rename_all_fields = "camelCase"` bridges them.
        let id = Ulid::new();
        let s = SessionState::Recording {
            meeting_id: id,
            window_id: 42,
            started_at: Utc::now(),
            title: "t".into(),
            path: "/tmp/m".into(),
        };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["kind"], "recording");
        assert_eq!(json["meetingId"], id.to_string());
        assert_eq!(json["windowId"], 42);
        assert!(json.get("startedAt").is_some(), "startedAt should be camelCase");
        assert!(json.get("started_at").is_none(), "should NOT have snake_case key");
    }
}
