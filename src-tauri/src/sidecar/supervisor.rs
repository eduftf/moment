use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use exponential_backoff::Backoff;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

use crate::sidecar::protocol::{Envelope, Request};
use crate::sidecar::state::{SidecarState, SidecarStateCell};

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("sidecar unavailable: {0:?}")]
    Unavailable(SidecarState),
    #[error("request timed out after {0:?}")]
    Timeout(Duration),
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

type Pending = Arc<DashMap<String, oneshot::Sender<SupervisorResult<serde_json::Value>>>>;

pub struct Supervisor {
    pub(super) state: Arc<SidecarStateCell>,
    pub(super) tx: mpsc::Sender<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
    pub(super) pending: Pending,
}

impl Supervisor {
    pub fn state(&self) -> SidecarState {
        self.state.load()
    }

    /// Spawn the sidecar and start the supervisor task. Returns once the
    /// first successful `availability` round-trip completes, so the caller
    /// can treat the returned Arc<Supervisor> as "warm".
    pub async fn spawn(binary: PathBuf) -> SupervisorResult<Arc<Self>> {
        let state = Arc::new(SidecarStateCell::default());
        let pending: Pending = Arc::new(DashMap::new());
        let (req_tx, req_rx) =
            mpsc::channel::<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>(64);

        let sup = Arc::new(Self {
            state: state.clone(),
            tx: req_tx,
            pending: pending.clone(),
        });

        tokio::spawn(supervisor_task(binary, state.clone(), pending.clone(), req_rx));

        // Wait up to 5 s for the state to become Ready.
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            if sup.state() == SidecarState::Ready {
                return Ok(sup);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(SupervisorError::Protocol(
                    "sidecar did not become ready within 5s".into(),
                ));
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    pub async fn request(
        &self,
        op: &str,
        args: Option<serde_json::Value>,
    ) -> SupervisorResult<serde_json::Value> {
        if !matches!(self.state.load(), SidecarState::Ready) {
            return Err(SupervisorError::Unavailable(self.state.load()));
        }
        let id = format!("req-{}", ulid::Ulid::new());
        let req = Request {
            id: id.clone(),
            op: op.to_string(),
            args,
        };
        let (reply_tx, reply_rx) = oneshot::channel();
        // The IO loop registers `pending[id]` right before writing stdin; we
        // hand the reply sender off together with the Request so the loop
        // owns the registration. This avoids a race where a very fast reply
        // arrives before the caller's own insertion into `pending`.
        self.tx
            .send((req, reply_tx))
            .await
            .map_err(|_| SupervisorError::Protocol("supervisor channel closed".into()))?;
        let timeout = Duration::from_secs(5);
        match tokio::time::timeout(timeout, reply_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(SupervisorError::Protocol("reply channel dropped".into())),
            Err(_) => {
                // Best-effort cleanup — IO loop may still remove by id when
                // it eventually writes stdin or receives a late reply.
                self.pending.remove(&id);
                Err(SupervisorError::Timeout(timeout))
            }
        }
    }
}

async fn supervisor_task(
    binary: PathBuf,
    state: Arc<SidecarStateCell>,
    pending: Pending,
    mut req_rx: mpsc::Receiver<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
) {
    let attempts = Backoff::new(u32::MAX, Duration::from_millis(100), Duration::from_secs(30));
    let mut attempts_iter = attempts.iter();

    loop {
        state.store(SidecarState::Starting);
        match spawn_once(&binary, &state, &pending, &mut req_rx).await {
            Ok(exit_code) => {
                tracing::warn!("sidecar exited cleanly with code {exit_code}, restarting");
            }
            Err(e) => {
                tracing::warn!("sidecar crashed: {e}, restarting with backoff");
            }
        }

        state.store(SidecarState::Backoff);
        match attempts_iter.next() {
            Some(Some(delay)) => tokio::time::sleep(delay).await,
            _ => {
                state.store(SidecarState::Dead);
                return;
            }
        }
    }
}

async fn spawn_once(
    binary: &PathBuf,
    state: &SidecarStateCell,
    pending: &Pending,
    req_rx: &mut mpsc::Receiver<(Request, oneshot::Sender<SupervisorResult<serde_json::Value>>)>,
) -> SupervisorResult<i32> {
    let mut child: Child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| SupervisorError::Protocol("no stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| SupervisorError::Protocol("no stdout".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| SupervisorError::Protocol("no stderr".into()))?;

    // Reader task: lines -> demux
    let reader_pending = pending.clone();
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            match serde_json::from_str::<Envelope>(&line) {
                Ok(Envelope::Reply { id, ok, result, error }) => {
                    if let Some((_, tx)) = reader_pending.remove(&id) {
                        let resp: SupervisorResult<serde_json::Value> = if ok {
                            Ok(result.unwrap_or(serde_json::Value::Null))
                        } else if let Some(err) = error {
                            Err(SupervisorError::Remote {
                                code: err.code,
                                message: err.message,
                            })
                        } else {
                            Err(SupervisorError::Protocol(
                                "ok:false without error payload".into(),
                            ))
                        };
                        let _ = tx.send(resp);
                    } else {
                        tracing::debug!("sidecar reply for unknown id: {id}");
                    }
                }
                Ok(Envelope::StreamEvent { stream_id, event, .. }) => {
                    // M2 does not emit streams. Log and drop.
                    tracing::debug!(
                        "sidecar stream event (reserved for M3): stream={stream_id} event={event}"
                    );
                }
                Ok(Envelope::Unknown(value)) => {
                    tracing::debug!("sidecar unknown envelope: {value}");
                }
                Err(e) => {
                    tracing::warn!("sidecar line parse failed: {e} — line: {line}");
                }
            }
        }
    });

    // Stderr drain task
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::debug!("sidecar stderr: {line}");
        }
    });

    // Probe availability to mark Ready.
    let probe_id = format!("req-probe-{}", ulid::Ulid::new());
    let probe = Request {
        id: probe_id.clone(),
        op: "availability".into(),
        args: None,
    };
    let (probe_tx, probe_rx) = oneshot::channel();
    pending.insert(probe_id.clone(), probe_tx);
    let probe_json = format!("{}\n", serde_json::to_string(&probe)?);
    stdin.write_all(probe_json.as_bytes()).await?;
    stdin.flush().await?;

    match tokio::time::timeout(Duration::from_secs(3), probe_rx).await {
        Ok(Ok(Ok(_))) => state.store(SidecarState::Ready),
        Ok(Ok(Err(e))) => {
            tracing::warn!("sidecar availability failed: {e}");
            pending.remove(&probe_id);
            return Err(e);
        }
        Ok(Err(_)) | Err(_) => {
            pending.remove(&probe_id);
            return Err(SupervisorError::Protocol(
                "availability probe timed out".into(),
            ));
        }
    }

    // Main loop: shuffle requests into stdin, cleanup on exit.
    loop {
        tokio::select! {
            msg = req_rx.recv() => {
                let Some((req, reply)) = msg else {
                    // Supervisor dropped, exit.
                    let _ = child.kill().await;
                    reader.abort();
                    stderr_task.abort();
                    return Ok(0);
                };
                pending.insert(req.id.clone(), reply);
                match serde_json::to_string(&req) {
                    Ok(line) => {
                        let line = format!("{line}\n");
                        if let Err(e) = stdin.write_all(line.as_bytes()).await {
                            pending.remove(&req.id);
                            tracing::warn!("sidecar stdin write failed: {e}");
                            let _ = child.kill().await;
                            reader.abort();
                            stderr_task.abort();
                            return Err(e.into());
                        }
                        let _ = stdin.flush().await;
                    }
                    Err(e) => {
                        if let Some((_, tx)) = pending.remove(&req.id) {
                            let _ = tx.send(Err(SupervisorError::Json(e)));
                        }
                    }
                }
            }
            status = child.wait() => {
                reader.abort();
                stderr_task.abort();
                // Fail all pending requests so callers don't hang.
                let keys: Vec<String> = pending.iter().map(|e| e.key().clone()).collect();
                for k in keys {
                    if let Some((_, tx)) = pending.remove(&k) {
                        let _ = tx.send(Err(SupervisorError::Protocol("sidecar exited".into())));
                    }
                }
                return Ok(status?.code().unwrap_or(-1));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::NamedTempFile;

    /// Build a tiny mock sidecar as a Python script that reads JSON-lines and
    /// echoes back a reply with the same id. Python is pre-installed on macOS
    /// and avoids the quoting minefield of sh+sed.
    fn mock_sidecar_script() -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        let script = r#"#!/usr/bin/env python3
import json, sys
# First line: availability probe
line = sys.stdin.readline()
if line:
    req = json.loads(line)
    reply = {
        "id": req["id"],
        "ok": True,
        "result": {"vision": "available", "speech": "unavailable", "llm": "unavailable"},
    }
    sys.stdout.write(json.dumps(reply) + "\n")
    sys.stdout.flush()
# Subsequent lines: echo faces=3
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
    except Exception:
        continue
    reply = {"id": req["id"], "ok": True, "result": {"faces": 3}}
    sys.stdout.write(json.dumps(reply) + "\n")
    sys.stdout.flush()
"#;
        f.write_all(script.as_bytes()).unwrap();
        f.flush().unwrap();
        let path = f.path().to_path_buf();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        f
    }

    #[tokio::test]
    async fn request_round_trip_via_mock() {
        let f = mock_sidecar_script();
        let sup = Supervisor::spawn(f.path().to_path_buf())
            .await
            .expect("spawn");
        assert_eq!(sup.state(), SidecarState::Ready);
        let result = sup
            .request(
                "count_faces",
                Some(serde_json::json!({"image_path": "/tmp/x.png"})),
            )
            .await
            .unwrap();
        assert_eq!(result["faces"], 3);
    }

    #[tokio::test]
    async fn request_when_dead_returns_unavailable() {
        // Inject a Supervisor whose state is Dead and confirm request short-circuits.
        let sup = Arc::new(Supervisor {
            state: Arc::new(SidecarStateCell::default()),
            tx: mpsc::channel(1).0,
            pending: Arc::new(DashMap::new()),
        });
        sup.state.store(SidecarState::Dead);
        let err = sup.request("anything", None).await.unwrap_err();
        assert!(matches!(err, SupervisorError::Unavailable(_)));
    }
}
