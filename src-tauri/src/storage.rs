use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::platform::WindowId;

#[derive(thiserror::Error, Debug)]
pub enum StorageError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("home directory unknown")]
    NoHome,
}

pub type StorageResult<T> = Result<T, StorageError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingMetadata {
    pub id: Ulid,
    pub schema_version: u32,
    pub title: String,
    pub window_title: String,
    pub window_id: WindowId,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub screenshots: Vec<ScreenshotEntry>,
    pub events: Vec<Event>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotEntry {
    pub file: String,
    pub trigger: String, // manual | peak | voice | hotkey
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub kind: String,
    pub at: DateTime<Utc>,
    pub detail: serde_json::Value,
}

pub struct Storage {
    pub root: PathBuf,
    /// Serializes the read-modify-write of `meeting.json` so concurrent writers
    /// (e.g. a manual capture and a peak-detection promotion firing at once)
    /// cannot clobber each other's appends. Mirrors the `Connection` mutex in
    /// `index_db.rs`. Guards the file contents, not the `PathBuf`, so it holds
    /// `()`; the lock scope covers the whole read/deserialize/push/write.
    meta_lock: std::sync::Mutex<()>,
}

impl Default for Storage {
    fn default() -> Self {
        let home = directories::BaseDirs::new()
            .map(|b| b.home_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        Self { root: home.join("Moment"), meta_lock: std::sync::Mutex::new(()) }
    }
}

impl Storage {
    pub fn new(root: PathBuf) -> Self { Self { root, meta_lock: std::sync::Mutex::new(()) } }

    pub fn create_meeting_dir(&self, title: &str, started_at: DateTime<Utc>) -> StorageResult<PathBuf> {
        let safe = sanitize_title(title);
        let dir = self.root.join(format!("{} {}", started_at.format("%Y-%m-%d %H-%M"), safe));
        std::fs::create_dir_all(dir.join("screenshots"))?;
        Ok(dir)
    }

    pub fn write_meeting_json(
        &self,
        dir: &Path,
        meeting_id: Ulid,
        title: &str,
        window_id: WindowId,
        started_at: DateTime<Utc>,
    ) -> StorageResult<()> {
        let m = MeetingMetadata {
            id: meeting_id,
            schema_version: 1,
            title: title.into(),
            window_title: title.into(),
            window_id,
            started_at,
            ended_at: None,
            screenshots: vec![],
            events: vec![Event {
                kind: "start".into(),
                at: started_at,
                detail: serde_json::json!({}),
            }],
        };
        let path = dir.join("meeting.json");
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }

    pub fn finalize_meeting_json(&self, dir: &Path, ended_at: DateTime<Utc>) -> StorageResult<()> {
        // Same file as `append_screenshot`; share the lock so a late screenshot
        // append cannot race with finalize and drop either write.
        let _guard = self.meta_lock.lock().unwrap();
        let path = dir.join("meeting.json");
        let bytes = std::fs::read(&path)?;
        let mut m: MeetingMetadata = serde_json::from_slice(&bytes)?;
        m.ended_at = Some(ended_at);
        m.events.push(Event { kind: "end".into(), at: ended_at, detail: serde_json::json!({}) });
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }

    pub fn append_screenshot(
        &self,
        dir: &Path,
        entry: ScreenshotEntry,
    ) -> StorageResult<()> {
        // Serialize the whole read-modify-write. Without this, two concurrent
        // callers can both read the same base state and the second write wins,
        // silently dropping the first caller's screenshot + event.
        let _guard = self.meta_lock.lock().unwrap();
        let path = dir.join("meeting.json");
        let bytes = std::fs::read(&path)?;
        let mut m: MeetingMetadata = serde_json::from_slice(&bytes)?;
        m.events.push(Event {
            kind: "manual_capture".into(),
            at: entry.at,
            detail: serde_json::json!({ "file": entry.file, "trigger": entry.trigger }),
        });
        m.screenshots.push(entry);
        std::fs::write(&path, serde_json::to_vec_pretty(&m)?)?;
        Ok(())
    }
}

fn sanitize_title(title: &str) -> String {
    title.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .chars().take(60).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn create_meeting_dir_writes_screenshots_subdir() {
        let tmp = tempdir().unwrap();
        let s = Storage::new(tmp.path().to_path_buf());
        let dir = s.create_meeting_dir("Team Sync", Utc::now()).unwrap();
        assert!(dir.join("screenshots").is_dir());
    }

    #[test]
    fn write_and_finalize_meeting_json_roundtrip() {
        let tmp = tempdir().unwrap();
        let s = Storage::new(tmp.path().to_path_buf());
        let now = Utc::now();
        let dir = s.create_meeting_dir("Test", now).unwrap();
        let id = Ulid::new();
        s.write_meeting_json(&dir, id, "Test", 42, now).unwrap();
        s.finalize_meeting_json(&dir, now).unwrap();

        let m: MeetingMetadata = serde_json::from_slice(&std::fs::read(dir.join("meeting.json")).unwrap()).unwrap();
        assert_eq!(m.id, id);
        assert!(m.ended_at.is_some());
        assert_eq!(m.events.len(), 2); // start + end
    }

    #[test]
    fn sanitize_title_drops_slashes() {
        assert_eq!(sanitize_title("a/b:c"), "a_b_c");
    }

    #[test]
    fn concurrent_append_screenshot_records_every_entry() {
        use std::sync::Arc;
        use std::thread;

        const N: usize = 32;

        let tmp = tempdir().unwrap();
        let s = Arc::new(Storage::new(tmp.path().to_path_buf()));
        let now = Utc::now();
        let dir = s.create_meeting_dir("Concurrent", now).unwrap();
        s.write_meeting_json(&dir, Ulid::new(), "Concurrent", 1, now).unwrap();

        let handles: Vec<_> = (0..N)
            .map(|i| {
                let s = Arc::clone(&s);
                let dir = dir.clone();
                thread::spawn(move || {
                    s.append_screenshot(
                        &dir,
                        ScreenshotEntry {
                            file: format!("shot-{i}.png"),
                            trigger: "peak".into(),
                            at: Utc::now(),
                        },
                    )
                    .unwrap();
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }

        let m: MeetingMetadata =
            serde_json::from_slice(&std::fs::read(dir.join("meeting.json")).unwrap()).unwrap();

        // No lost updates: exactly N screenshots, and the initial "start" event
        // plus one "manual_capture" event per append.
        assert_eq!(m.screenshots.len(), N, "every concurrent append must survive");
        assert_eq!(m.events.len(), N + 1, "start event + one per append");

        // Each thread wrote a distinct filename; all must be present.
        let mut files: Vec<_> = m.screenshots.iter().map(|e| e.file.clone()).collect();
        files.sort();
        files.dedup();
        assert_eq!(files.len(), N, "no screenshot filename was clobbered");
    }
}
