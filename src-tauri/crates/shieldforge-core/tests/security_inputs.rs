//! Security input tests.
//!
//! Hostile, malformed and boundary inputs must be rejected before they reach
//! the filesystem. Every case here is an attacker-controlled string.

use shieldforge_core::error::ErrorCode;
use shieldforge_core::model::ScanProfile;
use shieldforge_core::quarantine::{QuarantineRequest, QuarantineService, VaultQuarantineService};
use shieldforge_core::scan::{ScanJobManager, ScanOptions, ScanRequest};
use shieldforge_core::scanner::{FixtureScannerAdapter, ScannerAdapter};
use shieldforge_core::validation::{
    validate_job_id, validate_quarantine_id, validate_scan_path, LIMITS,
};
use std::sync::Arc;

fn manager() -> ScanJobManager {
    ScanJobManager::new(
        Arc::new(FixtureScannerAdapter),
        Arc::new(shieldforge_core::scan::InMemoryScanResultRepository::with_default_capacity()),
        None,
        1,
    )
}

#[test]
fn traversal_and_relative_paths_are_rejected() {
    for hostile in [
        "../../etc/passwd",
        "/var/../etc",
        "C:\\Users\\..\\Windows\\System32",
        "Documents/files",
        "./relative",
        "~/Documents",
        "",
        "    ",
    ] {
        assert!(
            validate_scan_path(hostile).is_err(),
            "{hostile:?} must be rejected"
        );
    }
}

#[test]
fn null_bytes_and_illegal_characters_are_rejected() {
    assert!(validate_scan_path("/tmp/evil\0.txt").is_err());
    assert!(validate_scan_path("/tmp/*.txt").is_err());
    assert!(validate_scan_path("/tmp/a|b").is_err());
    assert!(validate_scan_path("/tmp/a<b>c").is_err());
    assert!(validate_scan_path("/tmp/a\u{7}").is_err());
}

#[test]
fn the_windows_drive_colon_is_accepted() {
    assert!(validate_scan_path("C:\\Users\\tester").is_ok());
    assert!(validate_scan_path("D:/data").is_ok());
}

#[test]
fn overlong_paths_are_rejected() {
    let long = format!("/{}", "a".repeat(40_000));
    assert!(validate_scan_path(&long).is_err());
}

#[test]
fn id_grammar_blocks_path_traversal() {
    for hostile in [
        "../../../../etc/passwd",
        "qtn_../../etc",
        "qtn_",
        "qtn_ab/cd",
        "qtn_a b",
        "job_../../x",
        "..",
        "/etc/passwd",
    ] {
        if hostile.starts_with("qtn_") {
            assert!(
                validate_quarantine_id(hostile).is_err(),
                "{hostile:?} must be rejected"
            );
        } else if hostile.starts_with("job_") {
            assert!(validate_job_id(hostile).is_err(), "{hostile:?} must be rejected");
        } else {
            assert!(
                validate_quarantine_id(hostile).is_err() && validate_job_id(hostile).is_err(),
                "{hostile:?} must be rejected"
            );
        }
    }
}

#[test]
fn hostile_targets_never_reach_the_engine() {
    let jobs = manager();
    for hostile in ["../../etc", "C:\\Windows\\..\\System32", "relative/path"] {
        let error = jobs
            .start(ScanRequest {
                profile: ScanProfile::Custom,
                targets: vec![hostile.to_string()],
                options: ScanOptions::default(),
            })
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput, "{hostile} should be rejected");
    }
}

#[test]
fn hostile_quarantine_ids_never_reach_the_vault() {
    let dir = std::env::temp_dir().join(format!(
        "shieldforge-sec-{}",
        shieldforge_core::audit::now_rfc3339().replace([':', '-'], "")
    ));
    let vault = VaultQuarantineService::new(dir.join("vault"), None).unwrap();

    for hostile in ["../../etc/passwd", "qtn_", "qtn_ab/cd", ".."] {
        assert_eq!(vault.restore(hostile).unwrap_err().code, ErrorCode::InvalidInput);
        assert_eq!(vault.delete(hostile).unwrap_err().code, ErrorCode::InvalidInput);
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn quarantine_ignores_paths_that_are_not_absolute() {
    let dir = std::env::temp_dir().join(format!(
        "shieldforge-sec2-{}",
        shieldforge_core::audit::now_rfc3339().replace([':', '-'], "")
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let vault = VaultQuarantineService::new(dir.join("vault"), None).unwrap();

    let error = vault
        .quarantine(&QuarantineRequest {
            path: "relative/marker.bin".to_string(),
            detection_name: "Fixture.TestMarker-1".to_string(),
            category: shieldforge_core::model::ThreatCategory::TestFixture,
            engine: "fixture-scanner".to_string(),
            sha256: None,
        })
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidInput);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn permission_failures_are_reported_not_swallowed() {
    let jobs = manager();
    let error = jobs
        .start(ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec!["/proc/1/definitely-not-readable".to_string()],
            options: ScanOptions::default(),
        });

    // The target is rejected by validation on every platform, and - where it is
    // a valid absolute path - by the engine when it cannot be opened. Either way
    // the failure must be reported, never counted as clean.
    match error {
        Err(error) => assert!(matches!(
            error.code,
            ErrorCode::InvalidInput | ErrorCode::PermissionDenied | ErrorCode::EngineError
        )),
        Ok(progress) => {
            let summary = jobs.result(&progress.job_id);
            assert!(summary.is_err() || summary.unwrap().errors > 0);
        }
    }
}

#[test]
fn numeric_limits_match_the_frontend_contract() {
    assert_eq!(LIMITS.max_file_size_mb, (1, 4096));
    assert_eq!(LIMITS.max_duration_minutes, (1, 720));
    assert_eq!(LIMITS.keep_history_days, (1, 365));
    assert_eq!(LIMITS.results_page_size, (5, 200));
}

#[test]
fn scanner_capabilities_never_claim_real_time_monitoring() {
    let descriptor = FixtureScannerAdapter.descriptor();
    assert!(!descriptor.capabilities.real_time_monitoring);
    assert!(descriptor.available);
}
