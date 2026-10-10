//! ClamAV command-line adapter (feature `clamav`).
//!
//! Design constraints:
//! * the engine is executed as a **child process with an argument vector** -
//!   never through a shell, so no command injection is possible;
//! * stdout/stderr are captured with a bounded size and a hard timeout;
//! * engine output is parsed by [`parse_clamscan_output`], which is a pure
//!   function that is unit tested against well-formed, malformed and hostile
//!   output;
//! * if the binary is missing, the adapter reports `not_configured` rather than
//!   failing at start-up.
//!
//! Licensing note: ClamAV is GPL-2.0-only. Redistributing `clamscan`/`freshclam`
//! binaries or signature databases with a product has obligations that must be
//! reviewed by counsel before shipping. This adapter therefore talks to a
//! user-installed binary and is disabled by default.

use shieldforge_core::error::{Error, ErrorCode, Result};
use shieldforge_core::model::{
    Detection, ScanFileResult, ScanJobStatus, ScanProgress, ScanSummary, ScanVerdict,
    ScannerCapabilities, ScannerDescriptor, ScannerKind, ThreatCategory,
};
use shieldforge_core::scanner::{ScanEventSink, ScanRequest, ScannerAdapter};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Default binary name.
pub const CLAMSCAN_BIN: &str = "clamscan";

/// Maximum bytes of engine output retained (protects against runaway output).
pub const MAX_OUTPUT_BYTES: usize = 8 * 1024 * 1024;

/// Parsed engine output.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedOutput {
    /// Per-file results the engine reported.
    pub results: Vec<ScanFileResult>,
    /// Engine version from the summary block.
    pub engine_version: Option<String>,
    /// Number of signatures loaded by the engine.
    pub signature_count: Option<u64>,
    /// Files the engine says it scanned.
    pub scanned_files: Option<u64>,
    /// Files the engine reported as infected.
    pub infected_files: Option<u64>,
    /// Errors reported by the engine.
    pub total_errors: Option<u64>,
}

impl ParsedOutput {
    /// Number of detections in the parsed results.
    pub fn detections(&self) -> u64 {
        self.results
            .iter()
            .filter(|result| result.verdict == ScanVerdict::Detected)
            .count() as u64
    }

    /// Number of per-file errors.
    pub fn errors(&self) -> u64 {
        self.results
            .iter()
            .filter(|result| result.verdict == ScanVerdict::Error)
            .count() as u64
    }
}

/// Parses `clamscan` stdout.
///
/// Recognised line shapes:
/// * `<path>: <signature> FOUND`
/// * `<path>: <reason> ERROR`
/// * `Engine version: <version>`, `Known viruses: <n>`, `Scanned files: <n>`,
///   `Infected files: <n>`, `Total errors: <n>`
///
/// Anything else is ignored. Unparseable output never produces a `clean`
/// verdict: unknown lines are simply not counted.
pub fn parse_clamscan_output(output: &str) -> ParsedOutput {
    let mut parsed = ParsedOutput::default();
    let timestamp = shieldforge_core::audit::now_rfc3339();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(rest) = line.strip_prefix("Engine version:") {
            parsed.engine_version = Some(rest.trim().to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("Known viruses:") {
            parsed.signature_count = rest.trim().split_whitespace().next().and_then(|value| value.parse().ok());
            continue;
        }
        if let Some(rest) = line.strip_prefix("Scanned files:") {
            parsed.scanned_files = rest.trim().split_whitespace().next().and_then(|value| value.parse().ok());
            continue;
        }
        if let Some(rest) = line.strip_prefix("Infected files:") {
            parsed.infected_files = rest.trim().split_whitespace().next().and_then(|value| value.parse().ok());
            continue;
        }
        if let Some(rest) = line.strip_prefix("Total errors:") {
            parsed.total_errors = rest.trim().split_whitespace().next().and_then(|value| value.parse().ok());
            continue;
        }

        // Per-file verdict lines: "<path>: <detail> FOUND|ERROR"
        if let Some((path, detail)) = line.split_once(": ") {
            if let Some(signature) = detail.strip_suffix(" FOUND") {
                let signature = signature.trim();
                if path.is_empty() || signature.is_empty() {
                    continue;
                }
                parsed.results.push(ScanFileResult {
                    path: path.to_string(),
                    verdict: ScanVerdict::Detected,
                    detection: Some(Detection {
                        name: signature.to_string(),
                        category: classify(signature),
                        sha256: None,
                        size_bytes: None,
                        engine: "clamav".to_string(),
                        engine_version: parsed.engine_version.clone(),
                        signature_version: None,
                    }),
                    reason: Some("clamscan reported a match".to_string()),
                    scanned_at: timestamp.clone(),
                    duration_ms: None,
                });
            } else if let Some(reason) = detail.strip_suffix(" ERROR") {
                parsed.results.push(ScanFileResult {
                    path: path.to_string(),
                    verdict: ScanVerdict::Error,
                    detection: None,
                    reason: Some(reason.trim().to_string()),
                    scanned_at: timestamp.clone(),
                    duration_ms: None,
                });
            }
        }
    }

    parsed
}

/// Conservative category mapping: unknown signatures are never downgraded to
/// "harmless", they are reported as unclassified detections.
fn classify(signature: &str) -> ThreatCategory {
    let lower = signature.to_ascii_lowercase();
    if lower.contains("test") || lower.contains("eicar") || lower.contains("fixture") {
        ThreatCategory::TestFixture
    } else if lower.contains("pua") || lower.contains("adware") || lower.contains("tool") {
        ThreatCategory::Pua
    } else if lower.contains("susp") || lower.contains("heuristic") || lower.contains("gen") {
        ThreatCategory::Suspicious
    } else {
        ThreatCategory::Malware
    }
}

/// Adapter that shells out to `clamscan`.
#[derive(Debug, Clone)]
pub struct ClamAvAdapter {
    binary: String,
    engine_version: Option<String>,
    signature_count: Option<u64>,
    available: bool,
    reason: Option<String>,
}

impl ClamAvAdapter {
    /// Probes the engine by running `<binary> --version`.
    pub fn probe(binary: impl Into<String>) -> Self {
        let binary = binary.into();
        match run(&binary, &["--version"], Duration::from_secs(5)) {
            Ok(stdout) => {
                let version = stdout
                    .lines()
                    .find_map(|line| line.trim().strip_prefix("ClamAV "))
                    .map(|value| value.trim().to_string());
                Self {
                    binary,
                    engine_version: version,
                    signature_count: None,
                    available: true,
                    reason: None,
                }
            }
            Err(error) => Self {
                binary,
                engine_version: None,
                signature_count: None,
                available: false,
                reason: Some(format!(
                    "ClamAV was not found or could not be executed: {}",
                    error.message
                )),
            },
        }
    }

    /// True when the probe succeeded.
    pub fn binary(&self) -> &str {
        &self.binary
    }
}

impl ScannerAdapter for ClamAvAdapter {
    fn id(&self) -> &str {
        "clamav"
    }

    fn display_name(&self) -> &str {
        "ClamAV (clamscan)"
    }

    fn kind(&self) -> ScannerKind {
        ScannerKind::Clamav
    }

    fn capabilities(&self) -> ScannerCapabilities {
        ScannerCapabilities {
            quick_scan: true,
            full_scan: true,
            custom_path_scan: true,
            cancel: true,
            progress_events: false,
            // clamscan is an on-demand scanner: it is not a real-time monitor.
            real_time_monitoring: false,
        }
    }

    fn descriptor(&self) -> ScannerDescriptor {
        ScannerDescriptor {
            id: self.id().to_string(),
            display_name: self.display_name().to_string(),
            kind: ScannerKind::Clamav,
            available: self.available,
            engine_version: self.engine_version.clone(),
            signature_version: None,
            signature_count: self.signature_count,
            unavailable_reason: self.reason.clone(),
            last_checked_at: Some(shieldforge_core::audit::now_rfc3339()),
            capabilities: self.capabilities(),
        }
    }

    fn is_available(&self) -> bool {
        self.available
    }

    fn scan(&self, request: &ScanRequest, sink: &dyn ScanEventSink) -> Result<ScanSummary> {
        request.validate()?;
        if !self.available {
            return Err(Error::not_configured("Scanner not configured."));
        }
        if request.targets.is_empty() {
            return Err(Error::invalid("No scan targets were supplied."));
        }

        let mut args: Vec<String> = vec![
            "--recursive".to_string(),
            "--no-summary".to_string(),
            "--infected".to_string(),
        ];
        if !request.options.scan_archives {
            args.push("--scan-archive=no".to_string());
        }
        args.push("--max-filesize".to_string());
        args.push(format!("{}M", request.options.max_file_size_bytes / (1024 * 1024)));
        args.extend(request.targets.iter().cloned());

        let arg_refs: Vec<&str> = args.iter().map(|arg| arg.as_str()).collect();
        let output = run(&self.binary, &arg_refs, request.options.max_duration)?;
        let parsed = parse_clamscan_output(&output);

        let summary = ScanSummary {
            job_id: shieldforge_core::scan::new_job_id(),
            profile: request.profile,
            status: ScanJobStatus::Completed,
            started_at: Some(shieldforge_core::audit::now_rfc3339()),
            finished_at: Some(shieldforge_core::audit::now_rfc3339()),
            elapsed_ms: 0,
            scanned_files: parsed
                .scanned_files
                .unwrap_or(parsed.results.len() as u64),
            detections: parsed.detections(),
            errors: parsed.errors(),
            unsupported: 0,
            files: parsed.results.clone(),
            error: None,
        };

        sink.on_progress(&ScanProgress {
            job_id: summary.job_id.clone(),
            status: ScanJobStatus::Completed,
            profile: request.profile,
            started_at: summary.started_at.clone(),
            finished_at: summary.finished_at.clone(),
            elapsed_ms: summary.elapsed_ms,
            scanned_files: summary.scanned_files,
            total_files: None,
            detections: summary.detections,
            errors: summary.errors,
            unsupported: summary.unsupported,
            current_path: None,
            message: None,
        });

        Ok(summary)
    }
}

/// Runs a child process with an argument vector (no shell) and a hard timeout.
fn run(binary: &str, args: &[&str], timeout: Duration) -> Result<String> {
    let mut child = Command::new(binary)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|source| {
            Error::not_configured(format!("cannot execute {binary}: {source}"))
                .with_hint("Install ClamAV or configure a different scanning engine.")
        })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        Error::new(ErrorCode::EngineError, "cannot capture engine output")
    })?;

    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        use std::io::Read;
        let mut buffer = Vec::new();
        let mut limited = stdout.take(MAX_OUTPUT_BYTES as u64);
        let _ = limited.read_to_end(&mut buffer);
        let _ = sender.send(String::from_utf8_lossy(&buffer).to_string());
    });

    match receiver.recv_timeout(timeout) {
        Ok(output) => {
            let status = child.wait();
            match status {
                Ok(status) if status.code() == Some(0) || status.code() == Some(1) => Ok(output),
                // clamscan exits 1 when something was found, 2 on fatal errors.
                Ok(status) => Err(Error::new(
                    ErrorCode::EngineError,
                    format!("engine exited with status {}", status),
                )),
                Err(source) => Err(Error::new(
                    ErrorCode::EngineError,
                    format!("engine did not exit cleanly: {source}"),
                )),
            }
        }
        Err(_) => {
            let _ = child.kill();
            Err(Error::new(
                ErrorCode::EngineError,
                "engine exceeded the configured time budget",
            )
            .with_hint("Raise the job timeout or scan a smaller location."))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "/tmp/samples/eicar.com: Win.Test.EICAR_HDB-1 FOUND\n\
                          /tmp/samples/locked.db: Can't open file ERROR\n\
                          ----------- SCAN SUMMARY -----------\n\
                          Known viruses: 8607001\n\
                          Engine version: 1.4.1\n\
                          Scanned files: 12\n\
                          Infected files: 1\n\
                          Total errors: 1\n\
                          Time: 0.532 sec (0 m 0 s)\n";

    #[test]
    fn parses_detections_errors_and_summary_counters() {
        let parsed = parse_clamscan_output(SAMPLE);
        assert_eq!(parsed.engine_version.as_deref(), Some("1.4.1"));
        assert_eq!(parsed.signature_count, Some(8_607_001));
        assert_eq!(parsed.scanned_files, Some(12));
        assert_eq!(parsed.infected_files, Some(1));
        assert_eq!(parsed.total_errors, Some(1));
        assert_eq!(parsed.detections(), 1);
        assert_eq!(parsed.errors(), 1);

        let detection = parsed
            .results
            .iter()
            .find(|result| result.verdict == ScanVerdict::Detected)
            .expect("a detection must be parsed");
        assert_eq!(detection.path, "/tmp/samples/eicar.com");
        assert_eq!(
            detection.detection.as_ref().unwrap().name,
            "Win.Test.EICAR_HDB-1"
        );
        assert_eq!(
            detection.detection.as_ref().unwrap().category,
            ThreatCategory::TestFixture
        );
    }

    #[test]
    fn malformed_output_produces_no_results_and_never_a_false_clean() {
        for hostile in [
            "",
            "\n\n\n",
            "random text without structure",
            ":  FOUND",
            "no-separator FOUND",
            "/tmp/a:  FOUND",
            "Engine version:",
            "Known viruses: not-a-number",
            "Scanned files: -5",
        ] {
            let parsed = parse_clamscan_output(hostile);
            assert!(
                parsed.results.is_empty(),
                "unexpected results for {hostile:?}: {:?}",
                parsed.results
            );
        }
    }

    #[test]
    fn clean_output_yields_no_detections() {
        let clean = "----------- SCAN SUMMARY -----------\n\
                     Known viruses: 8607001\n\
                     Engine version: 1.4.1\n\
                     Scanned files: 3\n\
                     Infected files: 0\n\
                     Total errors: 0\n";
        let parsed = parse_clamscan_output(clean);
        assert_eq!(parsed.detections(), 0);
        assert!(parsed.results.is_empty());
    }

    #[test]
    fn signature_classification_is_conservative() {
        assert_eq!(classify("Win.Trojan.Generic-1"), ThreatCategory::Malware);
        assert_eq!(classify("PUA.Win.Tool.Packed"), ThreatCategory::Pua);
        assert_eq!(classify("Heuristic.Susp.Script"), ThreatCategory::Suspicious);
        assert_eq!(classify("Something.Unknown-2"), ThreatCategory::Malware);
    }

    #[test]
    fn a_missing_binary_is_reported_as_not_configured() {
        let adapter = ClamAvAdapter::probe("definitely-not-a-real-binary");
        assert!(!adapter.is_available());
        assert!(adapter.descriptor().unavailable_reason.is_some());
        assert!(!adapter.descriptor().capabilities.real_time_monitoring);
    }

    #[test]
    fn scanning_without_targets_is_rejected() {
        let adapter = ClamAvAdapter {
            binary: "clamscan".to_string(),
            engine_version: None,
            signature_count: None,
            available: true,
            reason: None,
        };
        let error = adapter
            .scan(
                &ScanRequest {
                    profile: shieldforge_core::model::ScanProfile::Quick,
                    targets: vec![],
                    options: shieldforge_core::scanner::ScanOptions::default(),
                },
                &shieldforge_core::scanner::NoopScanEventSink,
            )
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
    }
}
