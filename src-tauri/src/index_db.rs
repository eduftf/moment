use std::path::PathBuf;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use ulid::Ulid;

#[derive(thiserror::Error, Debug)]
pub enum IndexError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("directories: unable to resolve data dir")]
    NoDataDir,
}

pub type IndexResult<T> = Result<T, IndexError>;

pub struct Index {
    conn: std::sync::Mutex<Connection>,
}

impl Index {
    pub fn open_default() -> IndexResult<Self> {
        let dirs = directories::ProjectDirs::from("space", "GTools", "Moment")
            .ok_or(IndexError::NoDataDir)?;
        let data_dir = dirs.data_dir().to_path_buf();
        std::fs::create_dir_all(&data_dir)?;
        Self::open(data_dir.join("meetings.sqlite"))
    }

    pub fn open(path: PathBuf) -> IndexResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                path TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                peak INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS meetings_started_idx ON meetings(started_at DESC);
            "#,
        )?;
        Ok(Self { conn: std::sync::Mutex::new(conn) })
    }

    pub fn insert_started(&self, id: Ulid, title: &str, path: &str, started_at: DateTime<Utc>) -> IndexResult<()> {
        self.conn.lock().unwrap().execute(
            "INSERT INTO meetings (id, title, path, started_at) VALUES (?1, ?2, ?3, ?4)",
            params![id.to_string(), title, path, started_at.to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn mark_ended(&self, id: Ulid, ended_at: DateTime<Utc>) -> IndexResult<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE meetings SET ended_at = ?1 WHERE id = ?2",
            params![ended_at.to_rfc3339(), id.to_string()],
        )?;
        Ok(())
    }

    pub fn recent(&self, limit: u32) -> IndexResult<Vec<MeetingRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, path, started_at, ended_at, peak FROM meetings ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |r| {
            Ok(MeetingRow {
                id: r.get::<_, String>(0)?,
                title: r.get(1)?,
                path: r.get(2)?,
                started_at: r.get(3)?,
                ended_at: r.get(4)?,
                peak: r.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRow {
    pub id: String,
    pub title: String,
    pub path: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub peak: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_query_roundtrip() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let idx = Index::open(tmp.path().to_path_buf()).unwrap();
        let id = Ulid::new();
        idx.insert_started(id, "Demo", "/tmp/x", Utc::now()).unwrap();
        let rows = idx.recent(10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Demo");
    }

    #[test]
    fn mark_ended_sets_ended_at() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let idx = Index::open(tmp.path().to_path_buf()).unwrap();
        let id = Ulid::new();
        idx.insert_started(id, "Demo", "/tmp/x", Utc::now()).unwrap();
        idx.mark_ended(id, Utc::now()).unwrap();
        let rows = idx.recent(10).unwrap();
        assert!(rows[0].ended_at.is_some());
    }

    #[test]
    fn recent_orders_desc() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let idx = Index::open(tmp.path().to_path_buf()).unwrap();
        let t1 = Utc::now();
        let t2 = t1 + chrono::Duration::seconds(1);
        let id1 = Ulid::new();
        let id2 = Ulid::new();
        idx.insert_started(id1, "Early", "/a", t1).unwrap();
        idx.insert_started(id2, "Late", "/b", t2).unwrap();
        let rows = idx.recent(10).unwrap();
        assert_eq!(rows[0].title, "Late");
        assert_eq!(rows[1].title, "Early");
    }

    #[test]
    fn meeting_row_serializes_camel_case() {
        let row = MeetingRow {
            id: "X".into(), title: "T".into(), path: "/p".into(),
            started_at: "2026-01-01T00:00:00Z".into(),
            ended_at: Some("2026-01-01T00:01:00Z".into()),
            peak: 0,
        };
        let json = serde_json::to_value(&row).unwrap();
        assert!(json.get("startedAt").is_some());
        assert!(json.get("started_at").is_none());
        assert!(json.get("endedAt").is_some());
    }
}
