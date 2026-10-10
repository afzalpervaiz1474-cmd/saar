//! Scanner adapter interface.
//!
//! A `ScannerAdapter` is the *only* way the application inspects files. The UI
//! never talks to an engine directly, and the core never assumes an engine
//! exists: [`UnavailableScannerAdapter`] is the Phase 1 default and reports
//! `not_configured` for every operation.

use crate::error::{Error, Result};
use crate::model::{
    Detection, ScanFileResult, ScanProfile, ScanProgress, ScanSummary, ScanVerdict,
    ScannerCapabilities, ScannerDescriptor, ScannerKind, ThreatCategory,
};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Byte marker recognised by the harmless fixture scanner.
///
/// This is a purpose-built test string, **not** the EICAR test file, so it does
/// not trip other vendors' products and it is safe to keep in the repository.
pub const FIXTURE_MARKER: &[u8] = b"SHIELDFORGE-FIXTURE-MARKER-0001";

/// Name reported for a fixture detection.
pub const FIXTURE_DETECTION_NAME: &str = "Fixture.TestMarker-1";

/// Bounds applied to a single scan job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScanOptions {
    /// Inspect archive contents when the engine supports it.
    pub scan_archives: bool,
    /// Files larger than this are skipped (bounded I/O).
    pub max_file_size_bytes: u64,
    /// Whether symlinks are followed during directory traversal.
    pub follow_symlinks: bool,
    /// Hard deadline for the whole job.
    pub max_duration: Duration,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            scan_archives: true,
            max_file_size_bytes: 512 * 1024 * 1024,
            follow_symlinks: false,
            max_duration: Duration::from_secs(120 * 60),
        }
    }
}

/// A validated scan request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanRequest {
    pub profile: ScanProfile,
    pub targets: Vec<String>,
    pub options: ScanOptions,
}

impl ScanRequest {
    /// Validates the profile and every custom target before the engine sees them.
    pub fn validate(&self) -> Result<()> {
        match self.profile {
            ScanProfile::Custom => {
                if self.targets.is_empty() {
                    return Err(Error::invalid("Enter a folder path to scan."));
                }
                for target in &self.targets {
                    crate::validation::validate_scan_path(target)?;
                }
            }
            ScanProfile::Quick | ScanProfile::Full => {
                if !self.targets.is_empty() {
                    return Err(Error::invalid(
                        "Quick and full scans choose their own locations.",
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Receives progress events from a running scan and reports cancellation.
pub trait ScanEventSink: Send + Sync {
    /// Called periodically (and always at least once before finishing).
    fn on_progress(&self, progress: &ScanProgress);
    /// Polled by the engine so a job can stop early.
    fn is_cancelled(&self) -> bool;
}

/// Sink that ignores progress and never cancels (used in tests).
pub struct NoopScanEventSink;

impl ScanEventSink for NoopScanEventSink {
    fn on_progress(&self, _progress: &ScanProgress) {}
    fn is_cancelled(&self) -> bool {
        false
    }
}

/// The contract every scanning engine must implement.
///
/// Implementations must:
/// * return `Err(Error { code: NotConfigured, .. })` when they cannot run;
/// * never report `ScanVerdict::Clean` for a file they failed to read - use
///   `Error` or `Unsupported`;
/// * honour [`ScanEventSink::is_cancelled`] within a bounded time;
/// * treat [`ScanOptions::max_duration`] as a hard deadline.
pub trait ScannerAdapter: Send + Sync {
    /// Stable engine id.
    fn id(&self) -> &str;
    /// Human readable engine name.
    fn display_name(&self) -> &str;
    /// Engine family.
    fn kind(&self) -> ScannerKind;
    /// Capabilities, including (always `false` here) real-time monitoring.
    fn capabilities(&self) -> ScannerCapabilities;
    /// Full descriptor including the result of a real self-check.
    fn descriptor(&self) -> ScannerDescriptor;
    /// True only after a successful self-check.
    fn is_available(&self) -> bool;
    /// Runs a scan, reporting progress through `sink`.
    fn scan(&self, request: &ScanRequest, sink: &dyn ScanEventSink) -> Result<ScanSummary>;
}

/// The Phase 1 default: no engine is registered.
///
/// Every operation fails with `not_configured`. It exists so the application has
/// a single, honest answer instead of a fake one.
#[derive(Debug, Clone)]
pub struct UnavailableScannerAdapter {
    reason: String,
}

impl UnavailableScannerAdapter {
    /// Creates an adapter with the given explanation.
    pub fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl Default for UnavailableScannerAdapter {
    fn default() -> Self {
        Self::new("No scanning engine is registered in this build.")
    }
}

impl ScannerAdapter for UnavailableScannerAdapter {
    fn id(&self) -> &str {
        "none"
    }

    fn display_name(&self) -> &str {
        "No scanner registered"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::None
    }

    fn capabilities(&self) -> ScannerCapabilities {
        ScannerCapabilities::default()
    }

    fn descriptor(&self) -> ScannerDescriptor {
        ScannerDescriptor {
            id: self.id().to_string(),
            display_name: self.display_name().to_string(),
            kind: ScannerKind::None,
            available: false,
            engine_version: None,
            signature_version: None,
            signature_count: None,
            unavailable_reason: Some(self.reason.clone()),
            last_checked_at: Some(crate::audit::now_rfc3339()),
            capabilities: self.capabilities(),
        }
    }

    fn is_available(&self) -> bool {
        false
    }

    fn scan(&self, _request: &ScanRequest, _sink: &dyn ScanEventSink) -> Result<ScanSummary> {
        Err(Error::not_configured("Scanner not configured.").with_hint(&self.reason))
    }
}

/// Harmless test scanner used by the automated test-suite.
///
/// It recognises [`FIXTURE_MARKER`] and nothing else. It performs no network
/// access, no process spawning and no heuristic analysis, and it is wired into
/// the desktop build only behind the `fixture-scanner` feature so it can never
/// be mistaken for real protection in a shipped product.
#[derive(Debug, Default, Clone, Copy)]
pub struct FixtureScannerAdapter;

impl FixtureScannerAdapter {
    /// Descriptor for the fixture engine.
    pub fn descriptor_static() -> ScannerDescriptor {
        ScannerDescriptor {
            id: "fixture-scanner".to_string(),
            display_name: "ShieldForge Fixture Scanner (test only)".to_string(),
            kind: ScannerKind::Fixture,
            available: true,
            engine_version: Some("0.0.1-test".to_string()),
            signature_version: Some("fixture-sig-1".to_string()),
            signature_count: Some(1),
            unavailable_reason: None,
            last_checked_at: Some(crate::audit::now_rfc3339()),
            capabilities: ScannerCapabilities {
                quick_scan: true,
                full_scan: true,
                custom_path_scan: true,
                cancel: true,
                progress_events: true,
                // A file scanner is not a real-time monitor.
                real_time_monitoring: false,
            },
        }
    }
}

impl ScannerAdapter for FixtureScannerAdapter {
    fn id(&self) -> &str {
        "fixture-scanner"
    }

    fn display_name(&self) -> &str {
        "ShieldForge Fixture Scanner (test only)"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Fixture
    }

    fn capabilities(&self) -> ScannerCapabilities {
        Self::descriptor_static().capabilities
    }

    fn descriptor(&self) -> ScannerDescriptor {
        Self::descriptor_static()
    }

    fn is_available(&self) -> bool {
        true
    }

    fn scan(&self, request: &ScanRequest, sink: &dyn ScanEventSink) -> Result<ScanSummary> {
        request.validate()?;

        let started = SystemTime::now();
        let job_id = crate::scan::new_job_id();
        let files = collect_files(&request.targets, &request.options)?;
        let total = files.len() as u64;

        let mut results: Vec<ScanFileResult> = Vec::new();
        let mut detections = 0u64;
        let mut errors = 0u64;
        let mut unsupported = 0u64;

        for (index, path) in files.iter().enumerate() {
            if sink.is_cancelled() {
                return Ok(ScanSummary {
                    job_id,
                    profile: request.profile,
                    status: crate::model::ScanJobStatus::Cancelled,
                    started_at: Some(crate::audit::now_rfc3339()),
                    finished_at: Some(crate::audit::now_rfc3339()),
                    elapsed_ms: elapsed_ms(started),
                    scanned_files: results.len() as u64,
                    detections,
                    errors,
                    unsupported,
                    files: results,
                    error: None,
                });
            }

            let result = inspect_file(path, &request.options);
            match result.verdict {
                ScanVerdict::Detected => detections += 1,
                ScanVerdict::Error => errors += 1,
                ScanVerdict::Unsupported => unsupported += 1,
                ScanVerdict::Clean | ScanVerdict::Skipped => {}
            }
            results.push(result);

            if index % 16 == 0 {
                sink.on_progress(&ScanProgress {
                    job_id: job_id.clone(),
                    status: crate::model::ScanJobStatus::Running,
                    profile: request.profile,
                    started_at: None,
                    finished_at: None,
                    elapsed_ms: elapsed_ms(started),
                    scanned_files: results.len() as u64,
                    total_files: Some(total),
                    detections,
                    errors,
                    unsupported,
                    current_path: Some(path.display().to_string()),
                    message: None,
                });
            }
        }

        Ok(ScanSummary {
            job_id,
            profile: request.profile,
            status: crate::model::ScanJobStatus::Completed,
            started_at: None,
            finished_at: Some(crate::audit::now_rfc3339()),
            elapsed_ms: elapsed_ms(started),
            scanned_files: results.len() as u64,
            detections,
            errors,
            unsupported,
            files: results,
            error: None,
        })
    }
}

/// Inspects a single file with the fixture rules.
fn inspect_file(path: &Path, options: &ScanOptions) -> ScanFileResult {
    let scanned_at = crate::audit::now_rfc3339();
    let display = path.display().to_string();

    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(source) => {
            return ScanFileResult {
                path: display,
                verdict: ScanVerdict::Error,
                detection: None,
                reason: Some(format!("cannot stat file: {source}")),
                scanned_at,
                duration_ms: None,
            }
        }
    };

    if !metadata.is_file() {
        return ScanFileResult {
            path: display,
            verdict: ScanVerdict::Skipped,
            detection: None,
            reason: Some("not a regular file".to_string()),
            scanned_at,
            duration_ms: None,
        };
    }

    if metadata.len() > options.max_file_size_bytes {
        return ScanFileResult {
            path: display,
            verdict: ScanVerdict::Skipped,
            detection: None,
            reason: Some("exceeds the configured maximum file size".to_string()),
            scanned_at,
            duration_ms: None,
        };
    }

    let contents = match std::fs::read(path) {
        Ok(contents) => contents,
        Err(source) => {
            return ScanFileResult {
                path: display,
                verdict: ScanVerdict::Error,
                detection: None,
                reason: Some(format!("cannot read file: {source}")),
                scanned_at,
                duration_ms: None,
            }
        }
    };

    // Binary blobs the fixture engine cannot interpret are reported as
    // unsupported rather than clean.
    if contents.contains(&0u8) && !contains_marker(&contents) {
        return ScanFileResult {
            path: display,
            verdict: ScanVerdict::Unsupported,
            detection: None,
            reason: Some("binary content is not interpreted by the fixture engine".to_string()),
            scanned_at,
            duration_ms: None,
        };
    }

    if contains_marker(&contents) {
        return ScanFileResult {
            path: display,
            verdict: ScanVerdict::Detected,
            detection: Some(Detection {
                name: FIXTURE_DETECTION_NAME.to_string(),
                category: ThreatCategory::TestFixture,
                sha256: None,
                size_bytes: Some(metadata.len()),
                engine: "fixture-scanner".to_string(),
                engine_version: Some("0.0.1-test".to_string()),
                signature_version: Some("fixture-sig-1".to_string()),
            }),
            reason: Some("fixture signature matched".to_string()),
            scanned_at,
            duration_ms: None,
        };
    }

    ScanFileResult {
        path: display,
        verdict: ScanVerdict::Clean,
        detection: None,
        reason: None,
        scanned_at,
        duration_ms: None,
    }
}

fn contains_marker(contents: &[u8]) -> bool {
    contents
        .windows(FIXTURE_MARKER.len())
        .any(|window| window == FIXTURE_MARKER)
}

/// Collects the files under the requested targets, honouring the configured bounds.
///
/// Directory traversal is iterative (no recursion depth risk), never follows
/// symlinks unless explicitly enabled (loop protection), and stops at the
/// configured deadline.
pub fn collect_files(targets: &[String], options: &ScanOptions) -> Result<Vec<PathBuf>> {
    let deadline = SystemTime::now() + options.max_duration;
    let mut files: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = Vec::new();

    for target in targets {
        let path = PathBuf::from(target);
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(source) => {
                return Err(Error::new(
                    crate::error::ErrorCode::PermissionDenied,
                    format!("cannot open {}: {}", path.display(), source),
                ))
            }
        };
        if metadata.is_dir() {
            stack.push(path);
        } else if metadata.is_file() {
            files.push(path);
        }
    }

    while let Some(dir) = stack.pop() {
        if SystemTime::now() > deadline {
            break;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue, // Unreadable directories are skipped, not counted as clean.
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() {
                files.push(path);
            } else if metadata.file_type().is_symlink() && options.follow_symlinks {
                if let Ok(target) = std::fs::metadata(&path) {
                    if target.is_dir() {
                        stack.push(path);
                    } else if target.is_file() {
                        files.push(path);
                    }
                }
            }
        }
    }

    Ok(files)
}

fn elapsed_ms(since: SystemTime) -> u64 {
    SystemTime::now()
        .duration_since(since)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "shieldforge-scanner-{}-{}",
            tag,
            crate::audit::now_rfc3339().replace([':', '-'], "")
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn unavailable_adapter_reports_not_configured() {
        let adapter = UnavailableScannerAdapter::default();
        assert!(!adapter.is_available());
        assert_eq!(adapter.descriptor().available, false);
        assert_eq!(adapter.descriptor().capabilities.real_time_monitoring, false);

        let request = ScanRequest {
            profile: ScanProfile::Quick,
            targets: vec![],
            options: ScanOptions::default(),
        };
        let error = adapter.scan(&request, &NoopScanEventSink).unwrap_err();
        assert_eq!(error.code, crate::error::ErrorCode::NotConfigured);
    }

    #[test]
    fn request_validation_rejects_bad_custom_targets() {
        let bad = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec!["../etc".to_string()],
            options: ScanOptions::default(),
        };
        assert!(bad.validate().is_err());

        let empty = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec![],
            options: ScanOptions::default(),
        };
        assert!(empty.validate().is_err());

        let good = ScanRequest {
            profile: ScanProfile::Full,
            targets: vec![],
            options: ScanOptions::default(),
        };
        assert!(good.validate().is_ok());
    }

    #[test]
    fn fixture_adapter_detects_only_the_marker() {
        let dir = temp_dir("detect");
        std::fs::write(dir.join("clean.txt"), b"hello world").unwrap();
        std::fs::write(dir.join("marker.bin"), FIXTURE_MARKER).unwrap();

        let adapter = FixtureScannerAdapter;
        let request = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec![dir.display().to_string()],
            options: ScanOptions::default(),
        };
        let summary = adapter.scan(&request, &NoopScanEventSink).unwrap();

        assert_eq!(summary.detections, 1);
        assert_eq!(summary.status, crate::model::ScanJobStatus::Completed);
        let detected = summary
            .files
            .iter()
            .find(|file| file.verdict == ScanVerdict::Detected)
            .expect("a detection should be reported");
        assert_eq!(
            detected.detection.as_ref().unwrap().name,
            FIXTURE_DETECTION_NAME
        );
        assert!(summary.files.iter().any(|file| file.verdict == ScanVerdict::Clean));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unreadable_or_binary_content_is_never_reported_as_clean() {
        let dir = temp_dir("binary");
        std::fs::write(dir.join("blob.bin"), [0u8, 1, 2, 3]).unwrap();

        let adapter = FixtureScannerAdapter;
        let request = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec![dir.display().to_string()],
            options: ScanOptions::default(),
        };
        let summary = adapter.scan(&request, &NoopScanEventSink).unwrap();

        assert_eq!(summary.unsupported, 1);
        assert_eq!(summary.scanned_files, 1);
        assert!(!summary.files.iter().any(|file| file.verdict == ScanVerdict::Clean));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cancellation_stops_the_job_early() {
        let dir = temp_dir("cancel");
        for index in 0..64 {
            std::fs::write(dir.join(format!("file-{index}.txt")), b"benign content").unwrap();
        }

        struct CancelImmediately;
        impl ScanEventSink for CancelImmediately {
            fn on_progress(&self, _progress: &ScanProgress) {}
            fn is_cancelled(&self) -> bool {
                true
            }
        }

        let adapter = FixtureScannerAdapter;
        let request = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec![dir.display().to_string()],
            options: ScanOptions::default(),
        };
        let summary = adapter.scan(&request, &CancelImmediately).unwrap();
        assert_eq!(summary.status, crate::model::ScanJobStatus::Cancelled);
        assert_eq!(summary.scanned_files, 0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn oversized_files_are_skipped_not_scanned() {
        let dir = temp_dir("size");
        let mut big = vec![b'a'; 2048];
        big.extend_from_slice(FIXTURE_MARKER);
        std::fs::write(dir.join("big.bin"), &big).unwrap();

        let adapter = FixtureScannerAdapter;
        let request = ScanRequest {
            profile: ScanProfile::Custom,
            targets: vec![dir.display().to_string()],
            options: ScanOptions {
                max_file_size_bytes: 64,
                ..ScanOptions::default()
            },
        };
        let summary = adapter.scan(&request, &NoopScanEventSink).unwrap();
        assert_eq!(summary.detections, 0);
        assert!(summary
            .files
            .iter()
            .any(|file| file.verdict == ScanVerdict::Skipped));

        std::fs::remove_dir_all(&dir).ok();
    }
}
