//! Shared application state for the desktop shell.
//!
//! Everything the UI can reach is constructed here, once, at start-up. The
//! webview never constructs engines, opens paths or spawns processes on its own.

use shieldforge_core::audit::{FileAuditLog, SecurityAuditLog};
use shieldforge_core::model::PlatformFamily;
use shieldforge_core::protection::ProtectionStatusProvider;
use shieldforge_core::quarantine::VaultQuarantineService;
use shieldforge_core::scan::{InMemoryScanResultRepository, ScanJobManager};
use shieldforge_core::scanner::ScannerAdapter;
use shieldforge_core::updates::SignatureUpdateService;
use shieldforge_core::Result;
use std::path::PathBuf;
use std::sync::Arc;

use crate::adapters;
use crate::platform;

/// Live components held by the Tauri state manager.
pub struct AppState {
    /// Application data directory (per-user, never a system location).
    pub data_dir: PathBuf,
    /// Platform family of this build.
    pub platform: PlatformFamily,
    /// Registered scanning engine (unavailable by default in Phase 1).
    pub scanner: Arc<dyn ScannerAdapter>,
    /// Scan job manager.
    pub jobs: Arc<ScanJobManager>,
    /// Result store backing the Scan Results page.
    pub results: Arc<InMemoryScanResultRepository>,
    /// Quarantine vault, when it could be opened.
    pub quarantine: Option<Arc<VaultQuarantineService>>,
    /// Append-only audit log.
    pub audit: Arc<dyn SecurityAuditLog>,
    /// Update service (unconfigured in Phase 1).
    pub updates: Arc<dyn SignatureUpdateService>,
    /// Status provider used by the Protection Status page.
    pub protection: Arc<ProtectionStatusProvider>,
}

impl AppState {
    /// Builds every service from an application data directory.
    ///
    /// Failures are non-fatal by design: a component that cannot start reports
    /// `unavailable` instead of preventing the application from opening.
    pub fn bootstrap(data_dir: PathBuf) -> Result<Self> {
        let audit_dir = data_dir.join("logs");
        let vault_dir = data_dir.join("vault");

        let file_audit: Arc<dyn SecurityAuditLog> = match FileAuditLog::new(
            audit_dir.join("security-audit.log"),
            shieldforge_core::audit::DEFAULT_CAPACITY,
        ) {
            Ok(log) => Arc::new(log),
            Err(error) => {
                eprintln!("shieldforge: falling back to in-memory audit log: {error}");
                Arc::new(shieldforge_core::audit::InMemoryAuditLog::with_default_capacity())
            }
        };

        let scanner = adapters::default_scanner();
        let results = Arc::new(InMemoryScanResultRepository::with_default_capacity());
        let updates: Arc<dyn SignatureUpdateService> =
            Arc::new(shieldforge_core::updates::UnconfiguredUpdateService);

        let quarantine = match VaultQuarantineService::new(&vault_dir, Some(Arc::clone(&file_audit))) {
            Ok(service) => Some(Arc::new(service)),
            Err(error) => {
                eprintln!("shieldforge: quarantine vault unavailable: {error}");
                None
            }
        };

        let jobs = Arc::new(ScanJobManager::new(
            Arc::clone(&scanner),
            Arc::clone(&results),
            Some(Arc::clone(&file_audit)),
            shieldforge_core::scan::DEFAULT_MAX_CONCURRENT_JOBS,
        ));

        let protection = Arc::new(ProtectionStatusProvider::new(
            Arc::clone(&scanner),
            Arc::clone(&updates),
            quarantine.clone().map(|service| service as Arc<dyn shieldforge_core::quarantine::QuarantineService>),
            None,
            true,
            platform::family(),
        ));

        Ok(Self {
            data_dir,
            platform: platform::family(),
            scanner,
            jobs,
            results,
            quarantine,
            audit: file_audit,
            updates,
            protection,
        })
    }
}
