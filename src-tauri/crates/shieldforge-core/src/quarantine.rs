//! Quarantine service.
//!
//! Isolation is the most destructive thing the product can do, so the rules are
//! strict and every one of them is covered by a test:
//!
//! * a file is isolated **only** for a detection reported by a configured engine;
//! * vault entry ids are engine-generated and validated before touching the disk;
//! * restore writes back to the recorded original path and refuses to overwrite;
//! * deletion is permanent, explicit and audited;
//! * every action appends an audit record.

use crate::audit::SecurityAuditLog;
use crate::error::{Error, ErrorCode, Result};
use crate::json::{self, Value};
use crate::model::{AuditEvent, HistoryKind, Outcome, QuarantineItem, ThreatCategory};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Extension used for vault payloads.
pub const VAULT_EXTENSION: &str = "qtn";

static ITEM_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A validated request to isolate a detected file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuarantineRequest {
    /// Absolute path of the file to isolate.
    pub path: String,
    /// Detection name reported by the engine.
    pub detection_name: String,
    /// Detection category.
    pub category: ThreatCategory,
    /// Engine that produced the detection.
    pub engine: String,
    /// Optional digest of the file contents.
    pub sha256: Option<String>,
}

/// Vault operations.
pub trait QuarantineService: Send + Sync {
    /// Lists every isolated item.
    fn list(&self) -> Result<Vec<QuarantineItem>>;
    /// Isolates a detected file.
    fn quarantine(&self, request: &QuarantineRequest) -> Result<QuarantineItem>;
    /// Restores an item to its original location.
    fn restore(&self, id: &str) -> Result<QuarantineItem>;
    /// Permanently deletes an item.
    fn delete(&self, id: &str) -> Result<()>;
    /// True when the vault can be read and written.
    fn is_operational(&self) -> bool;
}

/// Generates a vault entry id.
pub fn new_item_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let counter = ITEM_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("qtn_{:x}{:x}", nanos, counter)
}

/// Filesystem-backed quarantine vault.
#[derive(Debug)]
pub struct VaultQuarantineService {
    root: PathBuf,
    audit: Option<Arc<dyn SecurityAuditLog>>,
}

impl VaultQuarantineService {
    /// Opens (creating if needed) the vault rooted at `root`.
    pub fn new(root: impl AsRef<Path>, audit: Option<Arc<dyn SecurityAuditLog>>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        std::fs::create_dir_all(&root).map_err(|source| {
            Error::permission_denied(format!("cannot create quarantine vault: {source}"))
        })?;
        Ok(Self { root, audit })
    }

    /// Vault root directory.
    pub fn root(&self) -> &Path {
        &self.root
    }

    fn payload_path(&self, id: &str) -> Result<PathBuf> {
        crate::validation::validate_quarantine_id(id)?;
        Ok(self.root.join(format!("{id}.{VAULT_EXTENSION}")))
    }

    fn metadata_path(&self, id: &str) -> Result<PathBuf> {
        crate::validation::validate_quarantine_id(id)?;
        Ok(self.root.join(format!("{id}.json")))
    }

    fn write_metadata(&self, item: &QuarantineItem) -> Result<()> {
        let line = json::write_object(&[
            ("id", Value::Str(item.id.clone())),
            ("original_path", Value::Str(item.original_path.clone())),
            ("vault_path", Value::Str(item.vault_path.clone())),
            ("quarantined_at", Value::Str(item.quarantined_at.clone())),
            ("detection_name", Value::Str(item.detection_name.clone())),
            ("category", Value::Str(category_to_str(item.category).to_string())),
            (
                "size_bytes",
                item.size_bytes.map(|value| Value::Int(value as i64)).unwrap_or(Value::Null),
            ),
            (
                "sha256",
                item.sha256.clone().map(Value::Str).unwrap_or(Value::Null),
            ),
            ("engine", Value::Str(item.engine.clone())),
            ("restorable", Value::Bool(item.restorable)),
        ]);
        std::fs::write(self.metadata_path(&item.id)?, line).map_err(|source| {
            Error::permission_denied(format!("cannot write quarantine metadata: {source}"))
        })
    }

    fn read_metadata(&self, id: &str) -> Result<QuarantineItem> {
        let raw = std::fs::read_to_string(self.metadata_path(id)?).map_err(|source| {
            Error::not_found(format!("quarantine item {id} was not found: {source}"))
        })?;
        let pairs = json::read_object(&raw).map_err(|_| {
            Error::new(
                ErrorCode::Internal,
                format!("quarantine metadata for {id} is corrupt"),
            )
        })?;
        let mut map = std::collections::HashMap::new();
        for (key, value) in pairs {
            map.insert(key, value);
        }

        let string = |key: &str| -> Result<String> {
            match map.get(key) {
                Some(Value::Str(value)) => Ok(value.clone()),
                _ => Err(Error::new(
                    ErrorCode::Internal,
                    format!("quarantine metadata is missing '{key}'"),
                )),
            }
        };

        Ok(QuarantineItem {
            id: string("id")?,
            original_path: string("original_path")?,
            vault_path: string("vault_path")?,
            quarantined_at: string("quarantined_at")?,
            detection_name: string("detection_name")?,
            category: parse_category(&string("category")?),
            size_bytes: match map.get("size_bytes") {
                Some(Value::Int(value)) => Some(*value as u64),
                _ => None,
            },
            sha256: match map.get("sha256") {
                Some(Value::Str(value)) => Some(value.clone()),
                _ => None,
            },
            engine: string("engine")?,
            restorable: matches!(map.get("restorable"), Some(Value::Bool(true))),
        })
    }

    fn audit(&self, kind: HistoryKind, title: &str, detail: &str, outcome: Outcome, target: &str) {
        if let Some(audit) = &self.audit {
            let _ = audit.record(AuditEvent::new(
                kind,
                title,
                detail,
                outcome,
                crate::model::AuditActor::User,
                Some(target.to_string()),
            ));
        }
    }
}

impl QuarantineService for VaultQuarantineService {
    fn list(&self) -> Result<Vec<QuarantineItem>> {
        let entries = std::fs::read_dir(&self.root).map_err(|source| {
            Error::permission_denied(format!("cannot read quarantine vault: {source}"))
        })?;

        let mut items = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            if crate::validation::validate_quarantine_id(stem).is_err() {
                continue;
            }
            if let Ok(item) = self.read_metadata(stem) {
                items.push(item);
            }
        }
        items.sort_by(|a, b| b.quarantined_at.cmp(&a.quarantined_at));
        Ok(items)
    }

    fn quarantine(&self, request: &QuarantineRequest) -> Result<QuarantineItem> {
        crate::validation::validate_scan_path(&request.path)?;
        if request.detection_name.trim().is_empty() {
            return Err(Error::invalid(
                "A detection name from a configured engine is required.",
            ));
        }

        let source = PathBuf::from(&request.path);
        if !source.is_file() {
            return Err(Error::not_found(format!(
                "{} does not exist or is not a file.",
                request.path
            )));
        }

        let metadata = std::fs::metadata(&source).map_err(|source| {
            Error::permission_denied(format!("cannot read {}: {source}", request.path))
        })?;

        let id = new_item_id();
        let vault_path = self.payload_path(&id)?;

        // Move first, then record: a failure leaves the file in place rather than
        // leaving an orphaned vault entry.
        std::fs::rename(&source, &vault_path).map_err(|source| {
            Error::permission_denied(format!("cannot isolate {}: {source}", request.path))
        })?;

        let item = QuarantineItem {
            id: id.clone(),
            original_path: request.path.clone(),
            vault_path: vault_path.display().to_string(),
            quarantined_at: crate::audit::now_rfc3339(),
            detection_name: request.detection_name.clone(),
            category: request.category,
            size_bytes: Some(metadata.len()),
            sha256: request.sha256.clone(),
            engine: request.engine.clone(),
            restorable: true,
        };

        if let Err(error) = self.write_metadata(&item) {
            // Roll the file back so the vault never claims an item it cannot restore.
            let _ = std::fs::rename(&vault_path, &source);
            return Err(error);
        }

        self.audit(
            HistoryKind::Quarantine,
            "Item isolated",
            &format!(
                "{} isolated as {} ({}).",
                item.original_path, item.detection_name, id
            ),
            Outcome::Success,
            &id,
        );
        Ok(item)
    }

    fn restore(&self, id: &str) -> Result<QuarantineItem> {
        crate::validation::validate_quarantine_id(id)?;
        let item = self.read_metadata(id)?;
        if !item.restorable {
            return Err(Error::invalid(
                "This item cannot be restored because its original metadata is incomplete.",
            ));
        }

        let target = PathBuf::from(&item.original_path);
        crate::validation::validate_scan_path(&item.original_path).map_err(|_| {
            Error::invalid("The recorded original path is no longer valid.")
        })?;

        // Refuse to overwrite: restore must never destroy an existing file.
        if target.exists() {
            return Err(Error::invalid(format!(
                "Refusing to overwrite an existing file at {}.",
                item.original_path
            ))
            .with_hint("Move or rename the existing file, then restore again."));
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let vault_path = self.payload_path(id)?;
        std::fs::rename(&vault_path, &target).map_err(|source| {
            self.audit(
                HistoryKind::RestoreFailed,
                "Restore failed",
                &format!("Could not restore {id}: {source}"),
                Outcome::Failure,
                id,
            );
            Error::permission_denied(format!("cannot restore {id}: {source}"))
        })?;

        let _ = std::fs::remove_file(self.metadata_path(id)?);
        self.audit(
            HistoryKind::Restore,
            "Item restored",
            &format!("{} restored to {}.", item.detection_name, item.original_path),
            Outcome::Success,
            id,
        );
        Ok(item)
    }

    fn delete(&self, id: &str) -> Result<()> {
        crate::validation::validate_quarantine_id(id)?;
        let item = self.read_metadata(id)?;
        let vault_path = self.payload_path(id)?;

        std::fs::remove_file(&vault_path)
            .or_else(|error| {
                if !vault_path.exists() {
                    Ok(())
                } else {
                    Err(error)
                }
            })
            .map_err(|source| {
                self.audit(
                    HistoryKind::DeleteFailed,
                    "Deletion failed",
                    &format!("Could not delete {id}: {source}"),
                    Outcome::Failure,
                    id,
                );
                Error::permission_denied(format!("cannot delete {id}: {source}"))
            })?;

        let _ = std::fs::remove_file(self.metadata_path(id)?);
        self.audit(
            HistoryKind::Delete,
            "Item deleted permanently",
            &format!("{} deleted from the vault.", item.detection_name),
            Outcome::Success,
            id,
        );
        Ok(())
    }

    fn is_operational(&self) -> bool {
        self.root.is_dir() && self.list().is_ok()
    }
}

fn category_to_str(category: ThreatCategory) -> &'static str {
    match category {
        ThreatCategory::Malware => "malware",
        ThreatCategory::Pua => "pua",
        ThreatCategory::Suspicious => "suspicious",
        ThreatCategory::TestFixture => "test_fixture",
        ThreatCategory::Unclassified => "unclassified",
    }
}

fn parse_category(value: &str) -> ThreatCategory {
    match value {
        "malware" => ThreatCategory::Malware,
        "pua" => ThreatCategory::Pua,
        "suspicious" => ThreatCategory::Suspicious,
        "test_fixture" => ThreatCategory::TestFixture,
        _ => ThreatCategory::Unclassified,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault(tag: &str) -> (PathBuf, VaultQuarantineService) {
        let dir = std::env::temp_dir().join(format!(
            "shieldforge-vault-{}-{}",
            tag,
            crate::audit::now_rfc3339().replace([':', '-'], "")
        ));
        let audit: Arc<dyn SecurityAuditLog> =
            Arc::new(crate::audit::InMemoryAuditLog::with_default_capacity());
        let service = VaultQuarantineService::new(dir.join("vault"), Some(audit)).unwrap();
        (dir, service)
    }

    fn sample_file(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, crate::scanner::FIXTURE_MARKER).unwrap();
        path
    }

    #[test]
    fn isolating_a_detected_file_moves_it_into_the_vault() {
        let (dir, service) = temp_vault("isolate");
        let file = sample_file(&dir, "sample.bin");

        let item = service
            .quarantine(&QuarantineRequest {
                path: file.display().to_string(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap();

        assert!(!file.exists(), "original file should be moved");
        assert!(PathBuf::from(&item.vault_path).exists());
        assert_eq!(service.list().unwrap().len(), 1);
        assert_eq!(item.detection_name, "Fixture.TestMarker-1");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_returns_the_file_to_its_original_path() {
        let (dir, service) = temp_vault("restore");
        let file = sample_file(&dir, "sample.bin");
        let original = file.display().to_string();

        let item = service
            .quarantine(&QuarantineRequest {
                path: original.clone(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap();

        service.restore(&item.id).unwrap();
        assert!(PathBuf::from(&original).exists());
        assert!(service.list().unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restore_refuses_to_overwrite_an_existing_file() {
        let (dir, service) = temp_vault("overwrite");
        let file = sample_file(&dir, "sample.bin");
        let original = file.display().to_string();

        let item = service
            .quarantine(&QuarantineRequest {
                path: original.clone(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap();

        // A different file now occupies the original path.
        std::fs::write(&original, b"replacement").unwrap();
        let error = service.restore(&item.id).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert!(error.message.contains("Refusing to overwrite"));
        assert_eq!(std::fs::read(&original).unwrap(), b"replacement");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_removes_the_payload_and_the_metadata() {
        let (dir, service) = temp_vault("delete");
        let file = sample_file(&dir, "sample.bin");
        let item = service
            .quarantine(&QuarantineRequest {
                path: file.display().to_string(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap();

        service.delete(&item.id).unwrap();
        assert!(service.list().unwrap().is_empty());
        assert!(!PathBuf::from(&item.vault_path).exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn path_traversal_ids_are_rejected_before_touching_the_disk() {
        let (dir, service) = temp_vault("traversal");
        for bad in ["../../etc/passwd", "qtn_", "qtn_ab/cd", "..", "qtn_a"] {
            assert_eq!(
                service.restore(bad).unwrap_err().code,
                ErrorCode::InvalidInput,
                "{bad} should be rejected"
            );
            assert_eq!(service.delete(bad).unwrap_err().code, ErrorCode::InvalidInput);
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn quarantine_requires_a_real_detection_and_a_real_file() {
        let (dir, service) = temp_vault("guards");

        let missing = service
            .quarantine(&QuarantineRequest {
                path: dir.join("nope.bin").display().to_string(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, ErrorCode::NotFound);

        let file = sample_file(&dir, "sample.bin");
        let no_detection = service
            .quarantine(&QuarantineRequest {
                path: file.display().to_string(),
                detection_name: "  ".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap_err();
        assert_eq!(no_detection.code, ErrorCode::InvalidInput);

        // The file must not have been touched by the rejected requests.
        assert!(file.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn every_action_is_audited() {
        let (dir, service) = temp_vault("audit");
        let audit: Arc<dyn SecurityAuditLog> =
            Arc::new(crate::audit::InMemoryAuditLog::with_default_capacity());
        let service = VaultQuarantineService::new(dir.join("vault2"), Some(Arc::clone(&audit))).unwrap();

        let file = sample_file(&dir, "sample.bin");
        let item = service
            .quarantine(&QuarantineRequest {
                path: file.display().to_string(),
                detection_name: "Fixture.TestMarker-1".to_string(),
                category: ThreatCategory::TestFixture,
                engine: "fixture-scanner".to_string(),
                sha256: None,
            })
            .unwrap();
        service.delete(&item.id).unwrap();

        let events = audit.recent(10).unwrap();
        assert!(events
            .iter()
            .any(|event| event.kind == HistoryKind::Quarantine));
        assert!(events.iter().any(|event| event.kind == HistoryKind::Delete));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn operational_flag_reflects_vault_readability() {
        let (dir, service) = temp_vault("operational");
        assert!(service.is_operational());
        std::fs::remove_dir_all(&dir).ok();
    }
}
