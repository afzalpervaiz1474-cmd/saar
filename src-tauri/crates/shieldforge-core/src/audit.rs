//! Security audit log.
//!
//! Every security-relevant action (scan start/finish, quarantine, restore,
//! deletion, update checks, setting changes) is recorded here. The log is
//! append-only and bounded: it is an operational record, not a tamper-proof
//! ledger, and the UI says so.

use crate::error::{Error, Result};
use crate::json::{self, Value};
use crate::model::{AuditActor, AuditEvent, HistoryKind, Outcome};
use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Default maximum number of records retained.
pub const DEFAULT_CAPACITY: usize = 500;

static EVENT_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generates a collision-resistant event id (`evt_<time><counter>`).
pub fn new_event_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let counter = EVENT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("evt_{:x}{:x}", nanos, counter)
}

/// Current UTC time as an RFC-3339 / ISO-8601 string.
pub fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    rfc3339_from_secs(secs)
}

/// Formats seconds since the Unix epoch as an RFC-3339 / ISO-8601 string.
pub fn rfc3339_from_secs(secs: u64) -> String {
    let (year, month, day, hour, minute, second) = civil_from_seconds(secs as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

/// Converts seconds since the Unix epoch into a civil date/time (Howard Hinnant's algorithm).
fn civil_from_seconds(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let (days, seconds_of_day) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let (year, month, day) = civil_from_days(days);
    (
        year,
        month,
        day,
        (seconds_of_day / 3600) as u32,
        (seconds_of_day % 3600 / 60) as u32,
        (seconds_of_day % 60) as u32,
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/* ------------------------------------------------------------------ *
 * Serialisation helpers (the flat JSON subset)
 * ------------------------------------------------------------------ */

impl HistoryKind {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            HistoryKind::ScanStarted => "scan_started",
            HistoryKind::ScanCompleted => "scan_completed",
            HistoryKind::ScanFailed => "scan_failed",
            HistoryKind::ScanCancelled => "scan_cancelled",
            HistoryKind::ThreatDetected => "threat_detected",
            HistoryKind::Quarantine => "quarantine",
            HistoryKind::Restore => "restore",
            HistoryKind::Delete => "delete",
            HistoryKind::RestoreFailed => "restore_failed",
            HistoryKind::DeleteFailed => "delete_failed",
            HistoryKind::UpdateCheck => "update_check",
            HistoryKind::UpdateApplied => "update_applied",
            HistoryKind::SettingsChanged => "settings_changed",
            HistoryKind::UiAction => "ui_action",
        }
    }

    /// Parses the wire representation.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "scan_started" => Some(HistoryKind::ScanStarted),
            "scan_completed" => Some(HistoryKind::ScanCompleted),
            "scan_failed" => Some(HistoryKind::ScanFailed),
            "scan_cancelled" => Some(HistoryKind::ScanCancelled),
            "threat_detected" => Some(HistoryKind::ThreatDetected),
            "quarantine" => Some(HistoryKind::Quarantine),
            "restore" => Some(HistoryKind::Restore),
            "delete" => Some(HistoryKind::Delete),
            "restore_failed" => Some(HistoryKind::RestoreFailed),
            "delete_failed" => Some(HistoryKind::DeleteFailed),
            "update_check" => Some(HistoryKind::UpdateCheck),
            "update_applied" => Some(HistoryKind::UpdateApplied),
            "settings_changed" => Some(HistoryKind::SettingsChanged),
            "ui_action" => Some(HistoryKind::UiAction),
            _ => None,
        }
    }
}

impl Outcome {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            Outcome::Success => "success",
            Outcome::Failure => "failure",
            Outcome::Cancelled => "cancelled",
            Outcome::Info => "info",
        }
    }

    /// Parses the wire representation.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "success" => Some(Outcome::Success),
            "failure" => Some(Outcome::Failure),
            "cancelled" => Some(Outcome::Cancelled),
            "info" => Some(Outcome::Info),
            _ => None,
        }
    }
}

impl AuditActor {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            AuditActor::User => "user",
            AuditActor::System => "system",
            AuditActor::Engine => "engine",
        }
    }

    /// Parses the wire representation.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "user" => Some(AuditActor::User),
            "system" => Some(AuditActor::System),
            "engine" => Some(AuditActor::Engine),
            _ => None,
        }
    }
}

impl AuditEvent {
    /// Serialises the event to one JSON line without a trailing newline.
    pub fn to_json_line(&self) -> String {
        json::write_object(&[
            ("id", Value::Str(self.id.clone())),
            ("at", Value::Str(self.at.clone())),
            ("kind", Value::Str(self.kind.as_str().to_string())),
            ("title", Value::Str(self.title.clone())),
            ("detail", Value::Str(self.detail.clone())),
            ("outcome", Value::Str(self.outcome.as_str().to_string())),
            ("actor", Value::Str(self.actor.as_str().to_string())),
            (
                "target",
                self.target
                    .clone()
                    .map(Value::Str)
                    .unwrap_or(Value::Null),
            ),
        ])
    }

    /// Parses an event written by [`AuditEvent::to_json_line`].
    pub fn from_json_line(line: &str) -> Result<Self> {
        let pairs = json::read_object(line)?;
        let mut map = std::collections::HashMap::new();
        for (key, value) in pairs {
            map.insert(key, value);
        }

        let string = |key: &str| -> Result<String> {
            match map.get(key) {
                Some(Value::Str(value)) => Ok(value.clone()),
                _ => Err(Error::new(
                    crate::error::ErrorCode::Internal,
                    format!("audit record is missing '{key}'"),
                )),
            }
        };

        Ok(AuditEvent {
            id: string("id")?,
            at: string("at")?,
            kind: HistoryKind::parse(&string("kind")?).ok_or_else(|| {
                Error::new(crate::error::ErrorCode::Internal, "audit record has an unknown kind")
            })?,
            title: string("title")?,
            detail: string("detail")?,
            outcome: Outcome::parse(&string("outcome")?).ok_or_else(|| {
                Error::new(crate::error::ErrorCode::Internal, "audit record has an unknown outcome")
            })?,
            actor: AuditActor::parse(&string("actor")?).unwrap_or(AuditActor::System),
            target: match map.get("target") {
                Some(Value::Str(value)) => Some(value.clone()),
                _ => None,
            },
        })
    }
}

/* ------------------------------------------------------------------ *
 * Implementations
 * ------------------------------------------------------------------ */

/// Append-only security audit log.
pub trait SecurityAuditLog: Send + Sync {
    /// Appends one event.
    fn record(&self, event: AuditEvent) -> Result<()>;
    /// Returns up to `limit` events, newest first.
    fn recent(&self, limit: usize) -> Result<Vec<AuditEvent>>;
    /// Total number of retained events.
    fn len(&self) -> usize;
    /// True when no events are retained.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Bounded in-memory audit log (used by tests and as a fallback).
#[derive(Debug)]
pub struct InMemoryAuditLog {
    inner: Mutex<VecDeque<AuditEvent>>,
    capacity: usize,
}

impl InMemoryAuditLog {
    /// Creates a log retaining at most `capacity` events.
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(VecDeque::with_capacity(capacity.min(DEFAULT_CAPACITY * 8))),
            capacity: capacity.max(1),
        }
    }

    /// Default capacity.
    pub fn with_default_capacity() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

impl SecurityAuditLog for InMemoryAuditLog {
    fn record(&self, event: AuditEvent) -> Result<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| Error::new(crate::error::ErrorCode::Internal, "audit log lock poisoned"))?;
        guard.push_back(event);
        while guard.len() > self.capacity {
            guard.pop_front();
        }
        Ok(())
    }

    fn recent(&self, limit: usize) -> Result<Vec<AuditEvent>> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| Error::new(crate::error::ErrorCode::Internal, "audit log lock poisoned"))?;
        Ok(guard.iter().rev().take(limit).cloned().collect())
    }

    fn len(&self) -> usize {
        self.inner.lock().map(|guard| guard.len()).unwrap_or(0)
    }
}

/// Append-only JSON-lines audit log stored inside the application data directory.
///
/// The file is opened in append mode for writes and rewritten (compacted) only
/// when the retention cap is exceeded.
#[derive(Debug)]
pub struct FileAuditLog {
    path: PathBuf,
    capacity: usize,
    /// Count of lines that failed to parse during reads (diagnostics only).
    corrupt_lines: Mutex<usize>,
}

impl FileAuditLog {
    /// Opens (or creates) the log at `path`.
    pub fn new(path: impl AsRef<Path>, capacity: usize) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|source| {
                Error::new(
                    crate::error::ErrorCode::PermissionDenied,
                    format!("cannot create audit directory: {source}"),
                )
            })?;
        }
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|source| {
                Error::new(
                    crate::error::ErrorCode::PermissionDenied,
                    format!("cannot open audit log: {source}"),
                )
            })?;
        Ok(Self {
            path,
            capacity: capacity.max(1),
            corrupt_lines: Mutex::new(0),
        })
    }

    /// Number of malformed lines encountered while reading (diagnostics only).
    pub fn corrupt_lines(&self) -> usize {
        self.corrupt_lines.lock().map(|guard| *guard).unwrap_or(0)
    }

    /// Path of the backing file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    fn append_line(&self, line: &str) -> Result<()> {
        let mut file: File = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|source| {
                Error::new(
                    crate::error::ErrorCode::PermissionDenied,
                    format!("cannot open audit log for writing: {source}"),
                )
            })?;
        file.write_all(line.as_bytes()).and_then(|_| file.write_all(b"\n")).map_err(|source| {
            Error::new(
                crate::error::ErrorCode::PermissionDenied,
                format!("cannot write audit record: {source}"),
            )
        })?;
        file.flush().ok();
        Ok(())
    }

    fn read_all(&self) -> Result<Vec<AuditEvent>> {
        let file = File::open(&self.path).map_err(|source| {
            Error::new(
                crate::error::ErrorCode::Internal,
                format!("cannot read audit log: {source}"),
            )
        })?;
        let mut events = Vec::new();
        let mut corrupt = 0usize;
        for line in BufReader::new(file).lines() {
            let line = match line {
                Ok(line) => line,
                Err(_) => {
                    corrupt += 1;
                    continue;
                }
            };
            if line.trim().is_empty() {
                continue;
            }
            match AuditEvent::from_json_line(&line) {
                Ok(event) => events.push(event),
                Err(_) => corrupt += 1,
            }
        }
        if let Ok(mut guard) = self.corrupt_lines.lock() {
            *guard = corrupt;
        }
        Ok(events)
    }

    fn compact(&self, events: &[AuditEvent]) -> Result<()> {
        let tmp = self.path.with_extension("tmp");
        {
            let mut file = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&tmp)
                .map_err(|source| {
                    Error::new(
                        crate::error::ErrorCode::PermissionDenied,
                        format!("cannot compact audit log: {source}"),
                    )
                })?;
            for event in events {
                file.write_all(event.to_json_line().as_bytes())
                    .and_then(|_| file.write_all(b"\n"))
                    .map_err(|source| {
                        Error::new(
                            crate::error::ErrorCode::PermissionDenied,
                            format!("cannot compact audit log: {source}"),
                        )
                    })?;
            }
            file.flush().ok();
        }
        std::fs::rename(&tmp, &self.path).map_err(|source| {
            Error::new(
                crate::error::ErrorCode::PermissionDenied,
                format!("cannot replace audit log: {source}"),
            )
        })
    }
}

impl SecurityAuditLog for FileAuditLog {
    fn record(&self, event: AuditEvent) -> Result<()> {
        self.append_line(&event.to_json_line())?;
        // Best-effort compaction: a failure here must never lose the record that
        // was just appended.
        if let Ok(mut events) = self.read_all() {
            if events.len() > self.capacity {
                let keep_from = events.len() - self.capacity;
                events.drain(..keep_from);
                let _ = self.compact(&events);
            }
        }
        Ok(())
    }

    fn recent(&self, limit: usize) -> Result<Vec<AuditEvent>> {
        let mut events = self.read_all()?;
        events.reverse();
        events.truncate(limit);
        Ok(events)
    }

    fn len(&self) -> usize {
        self.read_all().map(|events| events.len()).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(title: &str) -> AuditEvent {
        AuditEvent::new(
            HistoryKind::ScanStarted,
            title,
            "detail",
            Outcome::Info,
            AuditActor::User,
            None,
        )
    }

    #[test]
    fn timestamps_are_rfc3339_utc() {
        let stamp = now_rfc3339();
        assert!(stamp.ends_with('Z'));
        assert_eq!(stamp.len(), 20);
        assert!(stamp.starts_with("202"));
    }

    #[test]
    fn event_ids_are_unique() {
        let a = new_event_id();
        let b = new_event_id();
        assert!(a.starts_with("evt_"));
        assert_ne!(a, b);
    }

    #[test]
    fn in_memory_log_is_bounded_and_newest_first() {
        let log = InMemoryAuditLog::new(3);
        for index in 0..6 {
            log.record(event(&format!("event-{index}"))).unwrap();
        }
        assert_eq!(log.len(), 3);
        let recent = log.recent(10).unwrap();
        assert_eq!(recent[0].title, "event-5");
        assert_eq!(recent[2].title, "event-3");
    }

    #[test]
    fn json_round_trip_preserves_every_field() {
        let original = AuditEvent::new(
            HistoryKind::Quarantine,
            "Item isolated",
            "C:\\temp\\a.bin",
            Outcome::Success,
            AuditActor::Engine,
            Some("qtn_abc123".to_string()),
        );
        let parsed = AuditEvent::from_json_line(&original.to_json_line()).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn file_log_persists_across_instances() {
        let dir = std::env::temp_dir().join(format!("shieldforge-audit-{}", now_rfc3339().replace([':', '-'], "")));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audit.log");

        {
            let log = FileAuditLog::new(&path, DEFAULT_CAPACITY).unwrap();
            log.record(event("first")).unwrap();
            log.record(event("second")).unwrap();
        }
        let reopened = FileAuditLog::new(&path, DEFAULT_CAPACITY).unwrap();
        let recent = reopened.recent(10).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].title, "second");
        assert_eq!(recent[1].title, "first");
        assert_eq!(reopened.corrupt_lines(), 0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn file_log_compacts_to_the_retention_cap() {
        let dir = std::env::temp_dir().join(format!("shieldforge-audit-cap-{}", now_rfc3339().replace([':', '-'], "")));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audit.log");
        let log = FileAuditLog::new(&path, 5).unwrap();
        for index in 0..12 {
            log.record(event(&format!("event-{index}"))).unwrap();
        }
        assert!(log.len() <= 5);
        let recent = log.recent(10).unwrap();
        assert_eq!(recent[0].title, "event-11");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn corrupt_lines_are_skipped_not_invented() {
        let dir = std::env::temp_dir().join(format!("shieldforge-audit-corrupt-{}", now_rfc3339().replace([':', '-'], "")));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audit.log");
        std::fs::write(&path, "not json\n").unwrap();
        let log = FileAuditLog::new(&path, DEFAULT_CAPACITY).unwrap();
        log.record(event("valid")).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log.corrupt_lines(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }
}
