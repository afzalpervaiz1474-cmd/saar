//! Scan job management.
//!
//! The job manager owns the lifecycle of every scan: validation, concurrency
//! limits, progress reporting, cancellation, deadlines and result retention.
//! Engines only implement [`ScannerAdapter`]; all policy lives here.

use crate::audit::SecurityAuditLog;
use crate::error::{Error, ErrorCode, Result};
use crate::model::{
    AuditEvent, HistoryKind, Outcome, ScanJobStatus, ScanProgress, ScanSummary, ScanVerdict,
};
use crate::scanner::{ScanEventSink, ScanOptions, ScanRequest, ScannerAdapter};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Default number of scans allowed to run at once.
pub const DEFAULT_MAX_CONCURRENT_JOBS: usize = 1;

/// Default number of summaries retained for the results view.
pub const DEFAULT_RESULT_CAPACITY: usize = 20;

static JOB_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generates a job id (`job_<time><counter>`) owned by the native layer.
pub fn new_job_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let counter = JOB_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("job_{:x}{:x}", nanos, counter)
}

/* ------------------------------------------------------------------ *
 * Result repository
 * ------------------------------------------------------------------ */

/// Storage for completed scan summaries.
pub trait ScanResultRepository: Send + Sync {
    /// Stores (or replaces) a summary.
    fn save(&self, summary: ScanSummary) -> Result<()>;
    /// Loads a summary by job id.
    fn get(&self, job_id: &str) -> Result<Option<ScanSummary>>;
    /// Most recent summaries, newest first.
    fn recent(&self, limit: usize) -> Vec<ScanSummary>;
}

/// Bounded in-memory result store.
#[derive(Debug)]
pub struct InMemoryScanResultRepository {
    inner: Mutex<VecDeque<ScanSummary>>,
    capacity: usize,
}

impl InMemoryScanResultRepository {
    /// Creates a store retaining at most `capacity` summaries.
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(VecDeque::new()),
            capacity: capacity.max(1),
        }
    }

    /// Default capacity.
    pub fn with_default_capacity() -> Self {
        Self::new(DEFAULT_RESULT_CAPACITY)
    }
}

impl ScanResultRepository for InMemoryScanResultRepository {
    fn save(&self, summary: ScanSummary) -> Result<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| Error::new(ErrorCode::Internal, "result store lock poisoned"))?;
        guard.retain(|existing| existing.job_id != summary.job_id);
        guard.push_back(summary);
        while guard.len() > self.capacity {
            guard.pop_front();
        }
        Ok(())
    }

    fn get(&self, job_id: &str) -> Result<Option<ScanSummary>> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| Error::new(ErrorCode::Internal, "result store lock poisoned"))?;
        Ok(guard.iter().find(|summary| summary.job_id == job_id).cloned())
    }

    fn recent(&self, limit: usize) -> Vec<ScanSummary> {
        self.inner
            .lock()
            .map(|guard| guard.iter().rev().take(limit).cloned().collect())
            .unwrap_or_default()
    }
}

/* ------------------------------------------------------------------ *
 * Job manager
 * ------------------------------------------------------------------ */

struct JobRecord {
    id: String,
    profile: crate::model::ScanProfile,
    status: ScanJobStatus,
    progress: ScanProgress,
    cancel: Arc<AtomicBool>,
    started: Instant,
    summary: Option<ScanSummary>,
    error: Option<Error>,
}

#[derive(Default)]
struct ManagerInner {
    jobs: Vec<JobRecord>,
}

/// Owns every scan job and enforces the resource limits.
pub struct ScanJobManager {
    inner: Arc<Mutex<ManagerInner>>,
    scanner: Arc<dyn ScannerAdapter>,
    results: Arc<dyn ScanResultRepository>,
    audit: Option<Arc<dyn SecurityAuditLog>>,
    max_concurrent: usize,
}

impl ScanJobManager {
    /// Builds a manager around one scanner adapter.
    pub fn new(
        scanner: Arc<dyn ScannerAdapter>,
        results: Arc<dyn ScanResultRepository>,
        audit: Option<Arc<dyn SecurityAuditLog>>,
        max_concurrent: usize,
    ) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ManagerInner::default())),
            scanner,
            results,
            audit,
            max_concurrent: max_concurrent.max(1),
        }
    }

    /// Scanner descriptor, forwarded for the UI.
    pub fn scanner_descriptor(&self) -> crate::model::ScannerDescriptor {
        self.scanner.descriptor()
    }

    /// Number of jobs currently running.
    pub fn active_jobs(&self) -> usize {
        self.lock()
            .map(|guard| {
                guard
                    .jobs
                    .iter()
                    .filter(|job| {
                        matches!(job.status, ScanJobStatus::Starting | ScanJobStatus::Running)
                    })
                    .count()
            })
            .unwrap_or(0)
    }

    /// Starts a job on a worker thread and returns its first progress record.
    pub fn start(&self, request: ScanRequest) -> Result<ScanProgress> {
        request.validate()?;

        if !self.scanner.is_available() {
            return Err(Error::not_configured("Scanner not configured.")
                .with_hint("Install and configure a scanning engine before starting a scan."));
        }

        let job_id = new_job_id();
        let cancel = Arc::new(AtomicBool::new(false));

        {
            let mut guard = self.lock()?;
            let active = guard
                .jobs
                .iter()
                .filter(|job| {
                    matches!(job.status, ScanJobStatus::Starting | ScanJobStatus::Running)
                })
                .count();
            if active >= self.max_concurrent {
                return Err(Error::new(
                    ErrorCode::EngineError,
                    "A scan is already running.",
                )
                .with_hint("Wait for the current scan to finish or cancel it."));
            }

            guard.jobs.push(JobRecord {
                id: job_id.clone(),
                profile: request.profile,
                status: ScanJobStatus::Starting,
                progress: ScanProgress {
                    job_id: job_id.clone(),
                    status: ScanJobStatus::Starting,
                    profile: request.profile,
                    started_at: Some(crate::audit::now_rfc3339()),
                    finished_at: None,
                    elapsed_ms: 0,
                    scanned_files: 0,
                    total_files: None,
                    detections: 0,
                    errors: 0,
                    unsupported: 0,
                    current_path: None,
                    message: None,
                },
                cancel: Arc::clone(&cancel),
                started: Instant::now(),
                summary: None,
                error: None,
            });
        }

        self.audit(HistoryKind::ScanStarted, "Scan started", &format!("{} scan (job {})", profile_name(request.profile), job_id), Outcome::Info, Some(job_id.clone()));

        let inner = Arc::clone(&self.inner);
        let scanner = Arc::clone(&self.scanner);
        let results = Arc::clone(&self.results);
        let sink = JobSink {
            inner: Arc::clone(&self.inner),
            job_id: job_id.clone(),
            cancel: Arc::clone(&cancel),
        };
        let max_duration = request.options.max_duration;

        std::thread::spawn(move || {
            let outcome = scanner.scan(&request, &sink);
            let elapsed = sink.elapsed_ms(&inner);
            let deadline_exceeded = elapsed > max_duration.as_millis() as u64;

            let (status, summary, error) = match outcome {
                Ok(summary) if deadline_exceeded => (
                    ScanJobStatus::Failed,
                    None,
                    Some(
                        Error::new(
                            ErrorCode::EngineError,
                            "Scan exceeded its configured time budget.",
                        )
                        .with_hint("Raise the job timeout in Settings or scan a smaller location."),
                    ),
                ),
                Ok(summary) => (summary.status, Some(summary), None),
                Err(error) => (ScanJobStatus::Failed, None, Some(error)),
            };

            finish_job(&inner, &job_id, status, summary.clone(), error.clone(), elapsed);

            if let Some(summary) = summary {
                let _ = results.save(summary);
            }
        });

        self.progress(&job_id)
    }

    /// Runs a scan synchronously (tests, CLI, single-threaded hosts).
    pub fn run_blocking(&self, request: ScanRequest) -> Result<ScanSummary> {
        request.validate()?;
        if !self.scanner.is_available() {
            return Err(Error::not_configured("Scanner not configured."));
        }
        let job_id = new_job_id();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut guard = self.lock()?;
            guard.jobs.push(JobRecord {
                id: job_id.clone(),
                profile: request.profile,
                status: ScanJobStatus::Running,
                progress: ScanProgress {
                    job_id: job_id.clone(),
                    status: ScanJobStatus::Running,
                    profile: request.profile,
                    started_at: Some(crate::audit::now_rfc3339()),
                    finished_at: None,
                    elapsed_ms: 0,
                    scanned_files: 0,
                    total_files: None,
                    detections: 0,
                    errors: 0,
                    unsupported: 0,
                    current_path: None,
                    message: None,
                },
                cancel: Arc::clone(&cancel),
                started: Instant::now(),
                summary: None,
                error: None,
            });
        }

        let sink = JobSink {
            inner: Arc::clone(&self.inner),
            job_id: job_id.clone(),
            cancel,
        };
        let started = Instant::now();
        let outcome = self.scanner.scan(&request, &sink);
        let elapsed = started.elapsed().as_millis() as u64;

        let (status, summary, error) = match outcome {
            Ok(summary) => (summary.status, Some(summary), None),
            Err(error) => (ScanJobStatus::Failed, None, Some(error)),
        };
        finish_job(&self.inner, &job_id, status, summary.clone(), error.clone(), elapsed);
        if let Some(summary) = summary.clone() {
            self.results.save(summary)?;
        }
        match summary {
            Some(summary) if error.is_none() => Ok(summary),
            _ => Err(error.unwrap_or_else(|| Error::new(ErrorCode::Internal, "scan produced no result"))),
        }
    }

    /// Current progress for a job.
    pub fn progress(&self, job_id: &str) -> Result<ScanProgress> {
        crate::validation::validate_job_id(job_id)?;
        let guard = self.lock()?;
        let job = guard
            .jobs
            .iter()
            .find(|job| job.id == job_id)
            .ok_or_else(|| Error::not_found(format!("Unknown scan job: {job_id}")))?;

        let mut progress = job.progress.clone();
        progress.elapsed_ms = job.started.elapsed().as_millis() as u64;
        progress.status = job.status;
        Ok(progress)
    }

    /// Requests cancellation. The engine stops at its next checkpoint.
    pub fn cancel(&self, job_id: &str) -> Result<ScanProgress> {
        crate::validation::validate_job_id(job_id)?;
        {
            let mut guard = self.lock()?;
            let job = guard
                .jobs
                .iter_mut()
                .find(|job| job.id == job_id)
                .ok_or_else(|| Error::not_found(format!("Unknown scan job: {job_id}")))?;

            match job.status {
                ScanJobStatus::Starting | ScanJobStatus::Running => {
                    job.cancel.store(true, Ordering::SeqCst);
                    job.status = ScanJobStatus::Cancelling;
                    job.progress.status = ScanJobStatus::Cancelling;
                }
                ScanJobStatus::Cancelling => {}
                other => {
                    return Err(Error::new(
                        ErrorCode::InvalidInput,
                        format!("Job {job_id} cannot be cancelled (status: {}).", other.as_str()),
                    ))
                }
            }
        }
        self.audit(
            HistoryKind::ScanCancelled,
            "Scan cancellation requested",
            &format!("Cancellation requested for job {job_id}."),
            Outcome::Info,
            Some(job_id.to_string()),
        );
        self.progress(job_id)
    }

    /// Result set for a finished job.
    pub fn result(&self, job_id: &str) -> Result<ScanSummary> {
        crate::validation::validate_job_id(job_id)?;

        let stored = self.results.get(job_id)?;
        if let Some(summary) = stored {
            return Ok(summary);
        }

        let guard = self.lock()?;
        let job = guard
            .jobs
            .iter()
            .find(|job| job.id == job_id)
            .ok_or_else(|| Error::not_found(format!("Unknown scan job: {job_id}")))?;

        match (&job.summary, &job.error) {
            (Some(summary), _) => Ok(summary.clone()),
            (None, Some(error)) => Err(error.clone()),
            (None, None) => Err(Error::new(
                ErrorCode::EngineError,
                "The scan has not finished yet.",
            )),
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ManagerInner>> {
        self.inner
            .lock()
            .map_err(|_| Error::new(ErrorCode::Internal, "job manager lock poisoned"))
    }

    fn audit(
        &self,
        kind: HistoryKind,
        title: &str,
        detail: &str,
        outcome: Outcome,
        target: Option<String>,
    ) {
        if let Some(audit) = &self.audit {
            let _ = audit.record(AuditEvent::new(
                kind,
                title,
                detail,
                outcome,
                crate::model::AuditActor::User,
                target,
            ));
        }
    }
}

/// Progress sink that forwards engine events into the job registry.
struct JobSink {
    inner: Arc<Mutex<ManagerInner>>,
    job_id: String,
    cancel: Arc<AtomicBool>,
}

impl JobSink {
    fn elapsed_ms(&self, inner: &Arc<Mutex<ManagerInner>>) -> u64 {
        inner
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .jobs
                    .iter()
                    .find(|job| job.id == self.job_id)
                    .map(|job| job.started.elapsed().as_millis() as u64)
            })
            .unwrap_or(0)
    }
}

impl ScanEventSink for JobSink {
    fn on_progress(&self, progress: &ScanProgress) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(job) = guard.jobs.iter_mut().find(|job| job.id == self.job_id) {
                job.progress = ScanProgress {
                    job_id: self.job_id.clone(),
                    status: ScanJobStatus::Running,
                    profile: job.profile,
                    started_at: job.progress.started_at.clone(),
                    finished_at: None,
                    elapsed_ms: job.started.elapsed().as_millis() as u64,
                    scanned_files: progress.scanned_files,
                    total_files: progress.total_files,
                    detections: progress.detections,
                    errors: progress.errors,
                    unsupported: progress.unsupported,
                    current_path: progress.current_path.clone(),
                    message: progress.message.clone(),
                };
                if matches!(job.status, ScanJobStatus::Starting) {
                    job.status = ScanJobStatus::Running;
                }
            }
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

fn finish_job(
    inner: &Arc<Mutex<ManagerInner>>,
    job_id: &str,
    status: ScanJobStatus,
    summary: Option<ScanSummary>,
    error: Option<Error>,
    elapsed_ms: u64,
) {
    if let Ok(mut guard) = inner.lock() {
        if let Some(job) = guard.jobs.iter_mut().find(|job| job.id == job_id) {
            job.status = status;
            job.summary = summary.clone().or_else(|| job.summary.clone());
            job.error = error;
            job.progress.status = status;
            job.progress.elapsed_ms = elapsed_ms;
            job.progress.finished_at = Some(crate::audit::now_rfc3339());

            if let Some(summary) = summary {
                job.progress.scanned_files = summary.scanned_files;
                job.progress.detections = summary.detections;
                job.progress.errors = summary.errors;
                job.progress.unsupported = summary.unsupported;
            }
        }
    }
}

fn profile_name(profile: crate::model::ScanProfile) -> &'static str {
    match profile {
        crate::model::ScanProfile::Quick => "Quick",
        crate::model::ScanProfile::Full => "Full",
        crate::model::ScanProfile::Custom => "Custom",
    }
}

/// Counts verdicts in a summary (helper used by the UI-facing command layer).
pub fn count_verdicts(summary: &ScanSummary, verdict: ScanVerdict) -> u64 {
    summary
        .files
        .iter()
        .filter(|file| file.verdict == verdict)
        .count() as u64
}

/// Deadline helper shared with the platform layer.
pub fn deadline_from(options: &ScanOptions) -> Duration {
    options.max_duration
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ScanFileResult, ScanProfile, ScanVerdict, ScannerCapabilities, ScannerDescriptor, ScannerKind};
    use crate::scanner::{NoopScanEventSink, ScanEventSink};
    use std::sync::atomic::AtomicUsize;
    use std::thread::sleep;

    fn repo() -> Arc<InMemoryScanResultRepository> {
        Arc::new(InMemoryScanResultRepository::with_default_capacity())
    }

    fn audit_log() -> Arc<dyn SecurityAuditLog> {
        Arc::new(crate::audit::InMemoryAuditLog::with_default_capacity())
    }

    /// Deterministic adapter used to exercise the job manager.
    struct ScriptedScanner {
        files: usize,
        delay: Duration,
        fail: bool,
        progress_calls: Arc<AtomicUsize>,
    }

    impl ScriptedScanner {
        fn new(files: usize, delay: Duration) -> Self {
            Self {
                files,
                delay,
                fail: false,
                progress_calls: Arc::new(AtomicUsize::new(0)),
            }
        }
    }

    impl ScannerAdapter for ScriptedScanner {
        fn id(&self) -> &str {
            "scripted"
        }
        fn display_name(&self) -> &str {
            "Scripted test scanner"
        }
        fn kind(&self) -> ScannerKind {
            ScannerKind::Fixture
        }
        fn capabilities(&self) -> ScannerCapabilities {
            ScannerCapabilities {
                quick_scan: true,
                full_scan: true,
                custom_path_scan: true,
                cancel: true,
                progress_events: true,
                real_time_monitoring: false,
            }
        }
        fn descriptor(&self) -> ScannerDescriptor {
            ScannerDescriptor {
                id: "scripted".to_string(),
                display_name: "Scripted test scanner".to_string(),
                kind: ScannerKind::Fixture,
                available: true,
                engine_version: Some("test".to_string()),
                signature_version: Some("test-sig".to_string()),
                signature_count: Some(1),
                unavailable_reason: None,
                last_checked_at: None,
                capabilities: self.capabilities(),
            }
        }
        fn is_available(&self) -> bool {
            true
        }
        fn scan(&self, request: &ScanRequest, sink: &dyn ScanEventSink) -> Result<ScanSummary> {
            for index in 0..self.files {
                sleep(self.delay);
                if sink.is_cancelled() {
                    return Ok(ScanSummary {
                        job_id: "job_scripted".to_string(),
                        profile: request.profile,
                        status: ScanJobStatus::Cancelled,
                        started_at: None,
                        finished_at: None,
                        elapsed_ms: 0,
                        scanned_files: index as u64,
                        detections: 0,
                        errors: 0,
                        unsupported: 0,
                        files: vec![],
                        error: None,
                    });
                }
                self.progress_calls.fetch_add(1, Ordering::SeqCst);
                sink.on_progress(&ScanProgress {
                    job_id: "job_scripted".to_string(),
                    status: ScanJobStatus::Running,
                    profile: request.profile,
                    started_at: None,
                    finished_at: None,
                    elapsed_ms: 0,
                    scanned_files: index as u64 + 1,
                    total_files: Some(self.files as u64),
                    detections: 0,
                    errors: 0,
                    unsupported: 0,
                    current_path: None,
                    message: None,
                });
            }

            if self.fail {
                return Err(Error::new(ErrorCode::EngineError, "scripted failure"));
            }

            Ok(ScanSummary {
                job_id: "job_scripted".to_string(),
                profile: request.profile,
                status: ScanJobStatus::Completed,
                started_at: None,
                finished_at: None,
                elapsed_ms: 0,
                scanned_files: self.files as u64,
                detections: 0,
                errors: 0,
                unsupported: 0,
                files: vec![ScanFileResult {
                    path: "/tmp/fixture".to_string(),
                    verdict: ScanVerdict::Clean,
                    detection: None,
                    reason: None,
                    scanned_at: crate::audit::now_rfc3339(),
                    duration_ms: None,
                }],
                error: None,
            })
        }
    }

    fn request() -> ScanRequest {
        ScanRequest {
            profile: ScanProfile::Quick,
            targets: vec![],
            options: ScanOptions::default(),
        }
    }

    fn wait_for_terminal(manager: &ScanJobManager, job_id: &str) -> ScanProgress {
        for _ in 0..200 {
            if let Ok(progress) = manager.progress(job_id) {
                if progress.status.is_terminal() {
                    return progress;
                }
            }
            sleep(Duration::from_millis(10));
        }
        panic!("job did not reach a terminal state");
    }

    #[test]
    fn start_rejects_an_unavailable_scanner() {
        let manager = ScanJobManager::new(
            Arc::new(crate::scanner::UnavailableScannerAdapter::default()),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );
        let error = manager.start(request()).unwrap_err();
        assert_eq!(error.code, ErrorCode::NotConfigured);
    }

    #[test]
    fn start_validates_custom_targets() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(0, Duration::from_millis(0))),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );
        let error = manager
            .start(ScanRequest {
                profile: ScanProfile::Custom,
                targets: vec!["../etc".to_string()],
                options: ScanOptions::default(),
            })
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
    }

    #[test]
    fn a_job_runs_to_completion_and_stores_its_summary() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(4, Duration::from_millis(1))),
            repo(),
            Some(audit_log()),
            DEFAULT_MAX_CONCURRENT_JOBS,
        );

        let started = manager.start(request()).unwrap();
        assert!(matches!(
            started.status,
            ScanJobStatus::Starting | ScanJobStatus::Running
        ));

        let finished = wait_for_terminal(&manager, &started.job_id);
        assert_eq!(finished.status, ScanJobStatus::Completed);
        assert_eq!(finished.scanned_files, 4);

        let summary = manager.result(&started.job_id).unwrap();
        assert_eq!(summary.scanned_files, 4);
        assert_eq!(summary.files.len(), 1);
    }

    #[test]
    fn only_one_job_runs_at_a_time_by_default() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(8, Duration::from_millis(5))),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );

        let first = manager.start(request()).unwrap();
        let error = manager.start(request()).unwrap_err();
        assert_eq!(error.code, ErrorCode::EngineError);

        wait_for_terminal(&manager, &first.job_id);
        assert!(manager.start(request()).is_ok());
    }

    #[test]
    fn cancellation_stops_the_job_and_reports_cancelled() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(64, Duration::from_millis(20))),
            repo(),
            Some(audit_log()),
            DEFAULT_MAX_CONCURRENT_JOBS,
        );

        let started = manager.start(request()).unwrap();
        sleep(Duration::from_millis(30));
        let cancelling = manager.cancel(&started.job_id).unwrap();
        assert!(matches!(
            cancelling.status,
            ScanJobStatus::Cancelling | ScanJobStatus::Cancelled
        ));

        let final_state = wait_for_terminal(&manager, &started.job_id);
        assert_eq!(final_state.status, ScanJobStatus::Cancelled);
    }

    #[test]
    fn unknown_jobs_are_reported_as_not_found() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(0, Duration::from_millis(0))),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );
        assert_eq!(manager.progress("job_doesnotexist").unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(manager.result("job_doesnotexist").unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(manager.cancel("job_doesnotexist").unwrap_err().code, ErrorCode::NotFound);
    }

    #[test]
    fn malformed_job_ids_are_rejected_before_lookup() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(0, Duration::from_millis(0))),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );
        assert_eq!(manager.progress("../../etc").unwrap_err().code, ErrorCode::InvalidInput);
        assert_eq!(manager.result("job_").unwrap_err().code, ErrorCode::InvalidInput);
    }

    #[test]
    fn a_failing_engine_produces_a_failed_job_with_an_error() {
        let mut scanner = ScriptedScanner::new(0, Duration::from_millis(0));
        scanner.fail = true;
        let manager =
            ScanJobManager::new(Arc::new(scanner), repo(), None, DEFAULT_MAX_CONCURRENT_JOBS);

        let started = manager.start(request()).unwrap();
        let final_state = wait_for_terminal(&manager, &started.job_id);
        assert_eq!(final_state.status, ScanJobStatus::Failed);
        assert!(manager.result(&started.job_id).is_err());
    }

    #[test]
    fn jobs_that_exceed_their_budget_are_marked_failed() {
        let scanner = ScriptedScanner::new(1, Duration::from_millis(120));
        let manager =
            ScanJobManager::new(Arc::new(scanner), repo(), None, DEFAULT_MAX_CONCURRENT_JOBS);

        let started = manager
            .start(ScanRequest {
                profile: ScanProfile::Quick,
                targets: vec![],
                options: ScanOptions {
                    max_duration: Duration::from_millis(30),
                    ..ScanOptions::default()
                },
            })
            .unwrap();

        let final_state = wait_for_terminal(&manager, &started.job_id);
        assert_eq!(final_state.status, ScanJobStatus::Failed);
        let error = manager.result(&started.job_id).unwrap_err();
        assert!(error.message.contains("time budget"));
    }

    #[test]
    fn run_blocking_executes_without_threads() {
        let manager = ScanJobManager::new(
            Arc::new(ScriptedScanner::new(3, Duration::from_millis(0))),
            repo(),
            None,
            DEFAULT_MAX_CONCURRENT_JOBS,
        );
        let summary = manager.run_blocking(request()).unwrap();
        assert_eq!(summary.status, ScanJobStatus::Completed);
        assert_eq!(summary.scanned_files, 3);
        assert_eq!(manager.active_jobs(), 0);
    }

    #[test]
    fn result_repository_is_bounded() {
        let store = InMemoryScanResultRepository::new(2);
        for index in 0..5 {
            store
                .save(ScanSummary {
                    job_id: format!("job_{index:x}"),
                    profile: ScanProfile::Quick,
                    status: ScanJobStatus::Completed,
                    started_at: None,
                    finished_at: None,
                    elapsed_ms: 0,
                    scanned_files: 0,
                    detections: 0,
                    errors: 0,
                    unsupported: 0,
                    files: vec![],
                    error: None,
                })
                .unwrap();
        }
        assert_eq!(store.recent(10).len(), 2);
    }

    #[test]
    fn verdict_counts_match_the_file_records() {
        let summary = ScanSummary {
            job_id: "job_1".to_string(),
            profile: ScanProfile::Quick,
            status: ScanJobStatus::Completed,
            started_at: None,
            finished_at: None,
            elapsed_ms: 0,
            scanned_files: 3,
            detections: 1,
            errors: 1,
            unsupported: 1,
            files: vec![
                ScanFileResult {
                    path: "/a".to_string(),
                    verdict: ScanVerdict::Clean,
                    detection: None,
                    reason: None,
                    scanned_at: crate::audit::now_rfc3339(),
                    duration_ms: None,
                },
                ScanFileResult {
                    path: "/b".to_string(),
                    verdict: ScanVerdict::Error,
                    detection: None,
                    reason: Some("denied".to_string()),
                    scanned_at: crate::audit::now_rfc3339(),
                    duration_ms: None,
                },
                ScanFileResult {
                    path: "/c".to_string(),
                    verdict: ScanVerdict::Unsupported,
                    detection: None,
                    reason: None,
                    scanned_at: crate::audit::now_rfc3339(),
                    duration_ms: None,
                },
            ],
            error: None,
        };
        assert_eq!(count_verdicts(&summary, ScanVerdict::Clean), 1);
        assert_eq!(count_verdicts(&summary, ScanVerdict::Error), 1);
    }

    #[test]
    fn noop_sink_never_cancels() {
        assert!(!NoopScanEventSink.is_cancelled());
    }
}
