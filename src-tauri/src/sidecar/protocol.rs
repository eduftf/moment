use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Request {
    pub id: String,
    pub op: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
}

/// Envelope returned by the sidecar. Supports four shapes:
/// - success response: { id, ok: true, result }
/// - error response:   { id, ok: false, error }
/// - stream ack:       { id, ok: true, result: { stream_id } }  (reserved for M3)
/// - stream event:     { stream_id, event, ... }                (reserved for M3)
///
/// Unknown shapes deserialize into `Unknown` and are logged at debug.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Envelope {
    Reply {
        id: String,
        ok: bool,
        #[serde(default)]
        result: Option<serde_json::Value>,
        #[serde(default)]
        error: Option<ResponseError>,
    },
    StreamEvent {
        stream_id: String,
        event: String,
        #[serde(flatten)]
        extra: serde_json::Map<String, serde_json::Value>,
    },
    Unknown(serde_json::Value),
}

#[derive(Debug, Deserialize)]
pub struct ResponseError {
    pub code: String,
    pub message: String,
}
