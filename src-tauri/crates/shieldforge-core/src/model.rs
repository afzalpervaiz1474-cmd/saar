//! Domain model shared with the frontend.
//!
//! These types are the Rust half of the contract defined in
//! `src/types/models.ts`. Field-for-field parity is intentional: a change here
//! without a matching TypeScript change is a bug.

use crate::error::Error;

/// Operating system family the application is running on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum PlatformFamily {
    Windows,
    Macos,
    Linux,
    Android,
    Ios,
    Unknown,
}

impl PlatformFamily {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            PlatformFamily::Windows => "windows",
            PlatformFamily::Macos => "macos",
            PlatformFamily::Linux => "linux",
            PlatformFamily::Android => "android",
            PlatformFamily::Ios => "ios",
            PlatformFamily::Unknown => "unknown",
        }
    }

    /// Parses the wire representation.
    pub fn parse(value: &str) -> Self {
        match value {
            "windows" => PlatformFamily::Windows,
            "macos" => PlatformFamily::Macos,
            "linux" => PlatformFamily::Linux,
            "android" => PlatformFamily::Android,
            "ios" => PlatformFamily::Ios,
            _ => PlatformFamily::Unknown,
        }
    }
}

/// How the UI reached the native layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum NativeBridgeKind {
    /// Running inside the Tauri shell - native commands are available.
    Tauri,
    /// Running in a browser - native commands are unreachable.
    Unavailable,
}

impl NativeBridgeKind {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            NativeBridgeKind::Tauri => "tauri",
            NativeBridgeKind::Unavailable => "unavailable",
        }
    }
}

/// Application identity and runtime environment.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: PlatformFamily,
    pub platform_detail: String,
    pub arch: String,
    pub build_target: BuildTarget,
    pub native_bridge: NativeBridgeKind,
    pub build_time: Option<String>,
}

/// How the binary was built/run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "kebab-case"))]
pub enum BuildTarget {
    Desktop,
    WebPreview,
}

/// Every state a protection component can report.
///
/// Only `Active` may be rendered as "protected" in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ComponentState {
    Active,
    Degraded,
    NotImplemented,
    NotConfigured,
    PermissionRequired,
    Unavailable,
    Error,
}

impl ComponentState {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            ComponentState::Active => "active",
            ComponentState::Degraded => "degraded",
            ComponentState::NotImplemented => "not_implemented",
            ComponentState::NotConfigured => "not_configured",
            ComponentState::PermissionRequired => "permission_required",
            ComponentState::Unavailable => "unavailable",
            ComponentState::Error => "error",
        }
    }
}

/// Identifier of a protection component.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ComponentId {
    OnDemandScanner,
    SignatureDatabase,
    RealTimeMonitor,
    QuarantineService,
    UpdateService,
    AuditLog,
}

impl ComponentId {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            ComponentId::OnDemandScanner => "on_demand_scanner",
            ComponentId::SignatureDatabase => "signature_database",
            ComponentId::RealTimeMonitor => "real_time_monitor",
            ComponentId::QuarantineService => "quarantine_service",
            ComponentId::UpdateService => "update_service",
            ComponentId::AuditLog => "audit_log",
        }
    }

    /// Human readable label.
    pub fn label(self) -> &'static str {
        match self {
            ComponentId::OnDemandScanner => "On-demand scanner",
            ComponentId::SignatureDatabase => "Signature database",
            ComponentId::RealTimeMonitor => "Real-time monitoring",
            ComponentId::QuarantineService => "Quarantine service",
            ComponentId::UpdateService => "Update service",
            ComponentId::AuditLog => "Audit log",
        }
    }
}

/// Reported state of one protection component.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ProtectionComponent {
    pub id: ComponentId,
    pub label: String,
    pub description: String,
    pub state: ComponentState,
    pub detail: String,
    pub version: Option<String>,
    pub platforms: Vec<PlatformFamily>,
    pub last_checked_at: Option<String>,
    pub remediation: Option<String>,
}

/// Aggregated protection snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ProtectionSnapshot {
    pub components: Vec<ProtectionComponent>,
    pub generated_at: String,
    pub fully_operational: bool,
    pub engine_configured: bool,
}

/// Which kind of scanning engine is registered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ScannerKind {
    /// Nothing registered - the Phase 1 default.
    None,
    /// ClamAV via `clamscan` / `clamdscan`.
    Clamav,
    /// Harmless built-in marker scanner used by the test-suite only.
    Fixture,
    /// Platform-provided engine (future).
    Platform,
    /// Third-party engine behind a licensed API (future).
    ThirdParty,
}

/// What a scanner can do. A file scanner is never a real-time monitor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ScannerCapabilities {
    pub quick_scan: bool,
    pub full_scan: bool,
    pub custom_path_scan: bool,
    pub cancel: bool,
    pub progress_events: bool,
    pub real_time_monitoring: bool,
}

impl Default for ScannerCapabilities {
    fn default() -> Self {
        Self {
            quick_scan: false,
            full_scan: false,
            custom_path_scan: false,
            cancel: false,
            progress_events: false,
            real_time_monitoring: false,
        }
    }
}

/// Engine descriptor reported to the UI.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ScannerDescriptor {
    pub id: String,
    pub display_name: String,
    pub kind: ScannerKind,
    pub available: bool,
    pub engine_version: Option<String>,
    pub signature_version: Option<String>,
    pub signature_count: Option<u64>,
    pub unavailable_reason: Option<String>,
    pub last_checked_at: Option<String>,
    pub capabilities: ScannerCapabilities,
}

/// Scan profile requested by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum ScanProfile {
    Quick,
    Full,
    Custom,
}

impl ScanProfile {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            ScanProfile::Quick => "quick",
            ScanProfile::Full => "full",
            ScanProfile::Custom => "custom",
        }
    }

    /// Parses the wire representation.
    pub fn parse(value: &str) -> crate::Result<Self> {
        match value {
            "quick" => Ok(ScanProfile::Quick),
            "full" => Ok(ScanProfile::Full),
            "custom" => Ok(ScanProfile::Custom),
            other => Err(Error::invalid(format!("unsupported scan profile: {other}"))),
        }
    }
}

/// Lifecycle state of a scan job.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum ScanJobStatus {
    Starting,
    Running,
    Cancelling,
    Cancelled,
    Completed,
    Failed,
    Unavailable,
}

impl ScanJobStatus {
    /// Wire representation.
    pub fn as_str(self) -> &'static str {
        match self {
            ScanJobStatus::Starting => "starting",
            ScanJobStatus::Running => "running",
            ScanJobStatus::Cancelling => "cancelling",
            ScanJobStatus::Cancelled => "cancelled",
            ScanJobStatus::Completed => "completed",
            ScanJobStatus::Failed => "failed",
            ScanJobStatus::Unavailable => "unavailable",
        }
    }

    /// True once no further events will be produced for this job.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            ScanJobStatus::Cancelled | ScanJobStatus::Completed | ScanJobStatus::Failed | ScanJobStatus::Unavailable
        )
    }
}

/// Live progress of a scan job.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ScanProgress {
    pub job_id: String,
    pub status: ScanJobStatus,
    pub profile: ScanProfile,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub elapsed_ms: u64,
    pub scanned_files: u64,
    pub total_files: Option<u64>,
    pub detections: u64,
    pub errors: u64,
    pub unsupported: u64,
    pub current_path: Option<String>,
    pub message: Option<String>,
}

/// Verdict for a single scanned object.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum ScanVerdict {
    Clean,
    Detected,
    Unsupported,
    Error,
    Skipped,
}

/// Category of a detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ThreatCategory {
    Malware,
    Pua,
    Suspicious,
    TestFixture,
    Unclassified,
}

/// A detection reported by an engine.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Detection {
    pub name: String,
    pub category: ThreatCategory,
    pub sha256: Option<String>,
    pub size_bytes: Option<u64>,
    pub engine: String,
    pub engine_version: Option<String>,
    pub signature_version: Option<String>,
}

/// Result for one scanned object.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ScanFileResult {
    pub path: String,
    pub verdict: ScanVerdict,
    pub detection: Option<Detection>,
    pub reason: Option<String>,
    pub scanned_at: String,
    pub duration_ms: Option<u64>,
}

/// Final summary of a scan job.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ScanSummary {
    pub job_id: String,
    pub profile: ScanProfile,
    pub status: ScanJobStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub elapsed_ms: u64,
    pub scanned_files: u64,
    pub detections: u64,
    pub errors: u64,
    pub unsupported: u64,
    pub files: Vec<ScanFileResult>,
    pub error: Option<Error>,
}

/// An isolated file in the quarantine vault.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct QuarantineItem {
    pub id: String,
    pub original_path: String,
    pub vault_path: String,
    pub quarantined_at: String,
    pub detection_name: String,
    pub category: ThreatCategory,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub engine: String,
    pub restorable: bool,
}

/// State of the update service.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum UpdateState {
    UpToDate,
    UpdateAvailable,
    Checking,
    NotConfigured,
    Failed,
    Unavailable,
}

/// Update status reported to the UI.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct UpdateStatus {
    pub state: UpdateState,
    pub engine_version: Option<String>,
    pub installed_signature_version: Option<String>,
    pub installed_signature_released_at: Option<String>,
    pub latest_signature_version: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_success_at: Option<String>,
    /// True only for authenticated, integrity-verified packages.
    pub signatures_verified: bool,
    pub message: String,
    pub error: Option<Error>,
}

/// Kind of a history/audit event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum HistoryKind {
    ScanStarted,
    ScanCompleted,
    ScanFailed,
    ScanCancelled,
    ThreatDetected,
    Quarantine,
    Restore,
    Delete,
    RestoreFailed,
    DeleteFailed,
    UpdateCheck,
    UpdateApplied,
    SettingsChanged,
    UiAction,
}

/// Outcome of an audited action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum Outcome {
    Success,
    Failure,
    Cancelled,
    Info,
}

/// Actor responsible for an audited action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "lowercase"))]
pub enum AuditActor {
    User,
    System,
    Engine,
}

/// One append-only audit record.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuditEvent {
    pub id: String,
    pub at: String,
    pub kind: HistoryKind,
    pub title: String,
    pub detail: String,
    pub outcome: Outcome,
    pub actor: AuditActor,
    pub target: Option<String>,
}

impl AuditEvent {
    /// Builds a new audit event with a generated id and timestamp.
    pub fn new(
        kind: HistoryKind,
        title: impl Into<String>,
        detail: impl Into<String>,
        outcome: Outcome,
        actor: AuditActor,
        target: Option<String>,
    ) -> Self {
        Self {
            id: crate::audit::new_event_id(),
            at: crate::audit::now_rfc3339(),
            kind,
            title: title.into(),
            detail: detail.into(),
            outcome,
            actor,
            target,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_values_match_the_typescript_union() {
        assert_eq!(ComponentState::NotConfigured.as_str(), "not_configured");
        assert_eq!(ComponentState::Active.as_str(), "active");
        assert_eq!(ComponentId::OnDemandScanner.as_str(), "on_demand_scanner");
        assert_eq!(ComponentId::RealTimeMonitor.as_str(), "real_time_monitor");
        assert_eq!(ScanProfile::Custom.as_str(), "custom");
        assert_eq!(ScanJobStatus::Completed.as_str(), "completed");
        assert_eq!(PlatformFamily::Windows.as_str(), "windows");
    }

    #[test]
    fn profile_parsing_rejects_unknown_values() {
        assert_eq!(ScanProfile::parse("full").unwrap(), ScanProfile::Full);
        assert!(ScanProfile::parse("deep").is_err());
    }

    #[test]
    fn terminal_states_are_complete() {
        for status in [
            ScanJobStatus::Completed,
            ScanJobStatus::Failed,
            ScanJobStatus::Cancelled,
            ScanJobStatus::Unavailable,
        ] {
            assert!(status.is_terminal(), "{:?} should be terminal", status);
        }
        for status in [
            ScanJobStatus::Starting,
            ScanJobStatus::Running,
            ScanJobStatus::Cancelling,
        ] {
            assert!(!status.is_terminal(), "{:?} should not be terminal", status);
        }
    }

    #[test]
    fn default_capabilities_claim_nothing() {
        let caps = ScannerCapabilities::default();
        assert!(!caps.real_time_monitoring);
        assert!(!caps.quick_scan);
    }
}
