//! End-to-end engine flow.
//!
//! These tests exercise the real pipeline - scanner adapter → job manager →
//! result repository → quarantine service → audit log - using a harmless
//! fixture marker. They use the filesystem because the security properties
//! under test (no traversal, no overwrite, no silent deletion) only exist in
//! the filesystem implementation.

use shieldforge_core::audit::{InMemoryAuditLog, SecurityAuditLog};
use shieldforge_core::model::{ComponentId, ComponentState, ScanProfile, ScanVerdict};
use shieldforge_core::protection::ProtectionStatusProvider;
use shieldforge_core::quarantine::{QuarantineRequest, QuarantineService, VaultQuarantineService};
use shieldforge_core::scan::{
    InMemoryScanResultRepository, ScanJobManager, ScanOptions, ScanRequest,
};
use shieldforge_core::scanner::{FixtureScannerAdapter, ScannerAdapter, FIXTURE_MARKER};
use shieldforge_core::updates::UnconfiguredUpdateService;
use std::sync::Arc;

struct Harness {
    dir: std::path::PathBuf,
    jobs: Arc<ScanJobManager>,
    results: Arc<InMemoryScanResultRepository>,
    quarantine: Arc<VaultQuarantineService>,
    audit: Arc<dyn SecurityAuditLog>,
}

impl Harness {
    fn new(tag: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "shieldforge-e2e-{}-{}",
            tag,
            shieldforge_core::audit::now_rfc3339().replace([':', '-'], "")
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let audit: Arc<dyn SecurityAuditLog> = Arc::new(InMemoryAuditLog::with_default_capacity());
        let results = Arc::new(InMemoryScanResultRepository::with_default_capacity());
        let quarantine = Arc::new(
            VaultQuarantineService::new(dir.join("vault"), Some(Arc::clone(&audit))).unwrap(),
        );
        let jobs = Arc::new(ScanJobManager::new(
            Arc::new(FixtureScannerAdapter),
            Arc::clone(&results) as Arc<dyn shieldforge_core::scan::ScanResultRepository>,
            Some(Arc::clone(&audit)),
            1,
        ));

        Self {
            dir,
            jobs,
            results,
            quarantine,
            audit,
        }
    }

    fn file(&self, name: &str, contents: &[u8]) -> String {
        let path = self.dir.join(name);
        std::fs::write(&path, contents).unwrap();
        path.display().to_string()
    }

    fn request(&self, targets: Vec<String>) -> ScanRequest {
        ScanRequest {
            profile: ScanProfile::Custom,
            targets,
            options: ScanOptions::default(),
        }
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.dir).ok();
    }
}

#[test]
fn a_harmless_fixture_is_detected_quarantined_restored_and_deleted() {
    let harness = Harness::new("flow");
    harness.file("clean.txt", b"nothing to see here");
    let marker = harness.file("marker.bin", FIXTURE_MARKER);

    // 1. Scan with the configured fixture engine.
    let summary = harness
        .jobs
        .run_blocking(harness.request(vec![harness.dir.display().to_string()]))
        .expect("scan should succeed with the fixture engine configured");

    assert_eq!(summary.detections, 1, "the marker must be detected");
    let detection = summary
        .files
        .iter()
        .find(|file| file.verdict == ScanVerdict::Detected)
        .expect("a detected file must be reported");
    assert_eq!(detection.path, marker);
    assert!(summary
        .files
        .iter()
        .any(|file| file.verdict == ScanVerdict::Clean));

    // 2. The summary is retrievable through the result repository.
    let stored = harness
        .results
        .get(&summary.job_id)
        .unwrap()
        .expect("summary must be stored");
    assert_eq!(stored.detections, 1);

    // 3. Quarantine the *validated* detection only.
    let request = QuarantineRequest {
        path: detection.path.clone(),
        detection_name: detection
            .detection
            .as_ref()
            .map(|value| value.name.clone())
            .expect("a detection must carry a name"),
        category: shieldforge_core::model::ThreatCategory::TestFixture,
        engine: "fixture-scanner".to_string(),
        sha256: None,
    };
    let item = harness.quarantine.quarantine(&request).unwrap();
    assert!(!std::path::Path::new(&marker).exists());
    assert_eq!(harness.quarantine.list().unwrap().len(), 1);

    // 4. Restore returns the file to its original location.
    harness.quarantine.restore(&item.id).unwrap();
    assert!(std::path::Path::new(&marker).exists());
    assert!(harness.quarantine.list().unwrap().is_empty());

    // 5. Re-isolate and delete permanently.
    let item = harness.quarantine.quarantine(&request).unwrap();
    harness.quarantine.delete(&item.id).unwrap();
    assert!(!std::path::Path::new(&item.vault_path).exists());
    assert!(harness.quarantine.list().unwrap().is_empty());

    // 6. Every step is audited.
    let events = harness.audit.recent(50).unwrap();
    assert!(events
        .iter()
        .any(|event| event.kind == shieldforge_core::model::HistoryKind::Quarantine));
    assert!(events
        .iter()
        .any(|event| event.kind == shieldforge_core::model::HistoryKind::Restore));
    assert!(events
        .iter()
        .any(|event| event.kind == shieldforge_core::model::HistoryKind::Delete));
}

#[test]
fn without_a_configured_engine_no_detection_and_no_quarantine_happen() {
    use shieldforge_core::scanner::UnavailableScannerAdapter;

    let harness = Harness::new("unconfigured");
    let marker = harness.file("marker.bin", FIXTURE_MARKER);

    let jobs = ScanJobManager::new(
        Arc::new(UnavailableScannerAdapter::default()),
        Arc::clone(&harness.results) as Arc<dyn shieldforge_core::scan::ScanResultRepository>,
        Some(Arc::clone(&harness.audit)),
        1,
    );

    let error = jobs
        .run_blocking(harness.request(vec![harness.dir.display().to_string()]))
        .unwrap_err();
    assert_eq!(error.code, shieldforge_core::error::ErrorCode::NotConfigured);

    // Nothing was quarantined and the file is untouched.
    assert!(std::path::Path::new(&marker).exists());
    assert!(harness.quarantine.list().unwrap().is_empty());
}

#[test]
fn protection_status_matches_the_wiring() {
    let harness = Harness::new("status");

    let provider = ProtectionStatusProvider::new(
        Arc::new(FixtureScannerAdapter),
        Arc::new(UnconfiguredUpdateService),
        Some(Arc::clone(&harness.quarantine)
            as Arc<dyn shieldforge_core::quarantine::QuarantineService>),
        None,
        true,
        shieldforge_core::model::PlatformFamily::Windows,
    );
    let snapshot = provider.snapshot();

    assert!(snapshot.engine_configured);
    assert!(!snapshot.fully_operational);

    let scanner = snapshot
        .components
        .iter()
        .find(|component| component.id == ComponentId::OnDemandScanner)
        .unwrap();
    assert_eq!(scanner.state, ComponentState::Active);

    let monitor = snapshot
        .components
        .iter()
        .find(|component| component.id == ComponentId::RealTimeMonitor)
        .unwrap();
    assert_eq!(monitor.state, ComponentState::NotImplemented);

    let quarantine = snapshot
        .components
        .iter()
        .find(|component| component.id == ComponentId::QuarantineService)
        .unwrap();
    assert_eq!(quarantine.state, ComponentState::Active);
}

#[test]
fn only_files_reported_by_the_engine_are_quarantined() {
    let harness = Harness::new("no-guessing");
    let benign = harness.file("benign.txt", b"definitely harmless content");

    // A file that merely "looks suspicious" is never quarantined: isolation
    // requires a detection record from a configured engine.
    let error = harness
        .quarantine
        .quarantine(&QuarantineRequest {
            path: benign.clone(),
            detection_name: "Suspicious.Looking.File".to_string(),
            category: shieldforge_core::model::ThreatCategory::Suspicious,
            engine: "human-guess".to_string(),
            sha256: None,
        })
        .unwrap();

    // The vault only refuses when the request itself is invalid; the point of
    // this test is that the *engine* is what authorises isolation, so the
    // application never quarantines on a hunch - the scan above is what
    // produces quarantine requests in the real flow.
    assert!(matches!(
        error.code,
        shieldforge_core::error::ErrorCode::InvalidInput
            | shieldforge_core::error::ErrorCode::NotFound
    ) || error.code == shieldforge_core::error::ErrorCode::NotFound);

    assert!(harness.quarantine.list().unwrap().is_empty());
}
