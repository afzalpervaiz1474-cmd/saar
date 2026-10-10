//! Tauri commands exposed to the webview.
//!
//! This is the complete, auditable list of privileged operations reachable from
//! the UI (see `capabilities/default.json`). Rules:
//!
//! * every input is validated with `shieldforge_core::validation` before use;
//! * no command executes a shell, accepts a command string, or takes an
//!   arbitrary filesystem path from the UI - custom scan targets are the only
//!   user-supplied paths and they must be absolute and traversal-free;
//! * every command returns engine data or a typed error; none of them fabricate
//!   a value.

use shieldforge_core::audit::rfc3339_from_secs;
use shieldforge_core::error::Error;
use shieldforge_core::model::{
    AppInfo, AuditEvent, BuildTarget, PlatformFamily, ProtectionSnapshot, QuarantineItem,
    ScanProfile, ScanProgress, ScanSummary, ScannerDescriptor, UpdateStatus,
};
use shieldforge_core::quarantine::QuarantineService;
use shieldforge_core::scanner::ScanRequest;
use shieldforge_core::Result;
use tauri::State;

use crate::platform;
use crate::state::AppState;

/* ------------------------------------------------------------------ *
 * Application
 * ------------------------------------------------------------------ */

/// Product and platform identity.
#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: shieldforge_core::PRODUCT_NAME.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: platform::family(),
        platform_detail: platform::detail(),
        arch: platform::arch().to_string(),
        build_target: BuildTarget::Desktop,
        native_bridge: platform::native_bridge(),
        build_time: option_env!("SHIELDFORGE_BUILD_TIME")
            .and_then(|value| value.parse::<u64>().ok())
            .map(rfc3339_from_secs),
    }
}

/* ------------------------------------------------------------------ *
 * Protection
 * ------------------------------------------------------------------ */

/// Probes every protection component and reports what it found.
#[tauri::command]
pub fn get_protection_status(state: State<'_, AppState>) -> ProtectionSnapshot {
    state.protection.snapshot()
}

/// Descriptor (including the self-check result) for the registered engine.
#[tauri::command]
pub fn get_scanner_descriptor(state: State<'_, AppState>) -> ScannerDescriptor {
    state.scanner.descriptor()
}

/* ------------------------------------------------------------------ *
 * Scanning
 * ------------------------------------------------------------------ */

/// Scan request payload sent by the UI.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartScanRequest {
    /// `quick` | `full` | `custom`
    pub profile: String,
    /// Required (and only used) for `custom` scans.
    #[serde(default)]
    pub targets: Vec<String>,
}

/// Starts a scan job.
#[tauri::command]
pub fn scan_start(request: StartScanRequest, state: State<'_, AppState>) -> Result<ScanProgress> {
    let profile = ScanProfile::parse(&request.profile)
        .map_err(|_| Error::invalid("Unsupported scan profile."))?;

    let targets = match profile {
        ScanProfile::Quick => platform_quick_targets(state.platform),
        ScanProfile::Full => platform_full_targets(state.platform),
        ScanProfile::Custom => {
            // Every target is validated before the engine is invoked.
            for target in &request.targets {
                shieldforge_core::validation::validate_scan_path(target)?;
            }
            request.targets.clone()
        }
    };

    state.jobs.start(ScanRequest {
        profile,
        targets,
        options: shieldforge_core::scanner::ScanOptions::default(),
    })
}

/// Current progress of a job.
#[tauri::command]
pub fn scan_progress(job_id: String, state: State<'_, AppState>) -> Result<ScanProgress> {
    state.jobs.progress(&job_id)
}

/// Requests cancellation of a running job.
#[tauri::command]
pub fn scan_cancel(job_id: String, state: State<'_, AppState>) -> Result<ScanProgress> {
    state.jobs.cancel(&job_id)
}

/// Result set of a finished job.
#[tauri::command]
pub fn scan_results(job_id: String, state: State<'_, AppState>) -> Result<ScanSummary> {
    state.jobs.result(&job_id)
}

fn platform_quick_targets(family: PlatformFamily) -> Vec<String> {
    match family {
        PlatformFamily::Windows => crate::platform::windows::quick_scan_targets(),
        PlatformFamily::Macos => crate::platform::macos::quick_scan_targets(),
        PlatformFamily::Linux => default_linux_targets(),
        _ => Vec::new(),
    }
}

fn platform_full_targets(family: PlatformFamily) -> Vec<String> {
    match family {
        PlatformFamily::Windows => crate::platform::windows::full_scan_targets(),
        PlatformFamily::Macos => crate::platform::macos::full_scan_targets(),
        PlatformFamily::Linux => vec!["/home".to_string()],
        _ => Vec::new(),
    }
}

fn default_linux_targets() -> Vec<String> {
    let mut targets = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        targets.push(home);
    }
    targets.push("/tmp".to_string());
    targets
}

/* ------------------------------------------------------------------ *
 * Quarantine
 * ------------------------------------------------------------------ */

fn quarantine<'a>(state: &'a State<'_, AppState>) -> Result<&'a Arc<shieldforge_core::quarantine::VaultQuarantineService>> {
    state.quarantine.as_ref().ok_or_else(|| {
        Error::not_implemented("The quarantine vault is not available.").with_hint(
            "Check that the application data directory is writable.",
        )
    })
}

/// Lists isolated items.
#[tauri::command]
pub fn quarantine_list(state: State<'_, AppState>) -> Result<Vec<QuarantineItem>> {
    quarantine(&state)?.list()
}

/// Restores an item to its recorded original path.
#[tauri::command]
pub fn quarantine_restore(id: String, state: State<'_, AppState>) -> Result<Vec<QuarantineItem>> {
    let service = quarantine(&state)?;
    service.restore(&id)?;
    service.list()
}

/// Permanently deletes an item from the vault.
#[tauri::command]
pub fn quarantine_delete(id: String, state: State<'_, AppState>) -> Result<Vec<QuarantineItem>> {
    let service = quarantine(&state)?;
    service.delete(&id)?;
    service.list()
}

/* ------------------------------------------------------------------ *
 * Updates
 * ------------------------------------------------------------------ */

/// Last known update status.
#[tauri::command]
pub fn update_status(state: State<'_, AppState>) -> Result<UpdateStatus> {
    state.updates.status()
}

/// Contacts the configured (signed) update source.
#[tauri::command]
pub fn update_check(state: State<'_, AppState>) -> Result<UpdateStatus> {
    state.updates.check()
}

/* ------------------------------------------------------------------ *
 * History & audit
 * ------------------------------------------------------------------ */

/// Recent history entries, newest first.
#[tauri::command]
pub fn history_list(state: State<'_, AppState>, limit: Option<usize>) -> Result<Vec<AuditEvent>> {
    state.audit.recent(limit.unwrap_or(200).min(500))
}

/// Full audit trail, newest first.
#[tauri::command]
pub fn audit_list(state: State<'_, AppState>, limit: Option<usize>) -> Result<Vec<AuditEvent>> {
    state.audit.recent(limit.unwrap_or(200).min(500))
}
