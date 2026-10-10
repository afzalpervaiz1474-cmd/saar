//! Protection status provider - the honesty layer.
//!
//! This module is the single place where "is the user protected?" is answered,
//! and it is intentionally conservative:
//!
//! * a component is `Active` only after a real probe succeeds;
//! * `engine_configured` is true only when the scanner self-check passes;
//! * `fully_operational` requires **every** component to be active;
//! * real-time monitoring is reported by a [`RealTimeMonitor`] implementation -
//!   with none registered (Phase 1) it is `NotImplemented`, never `Active`.

use crate::error::Result;
use crate::model::{
    ComponentId, ComponentState, PlatformFamily, ProtectionComponent, ProtectionSnapshot,
};
use crate::quarantine::QuarantineService;
use crate::scanner::ScannerAdapter;
use crate::updates::SignatureUpdateService;
use std::sync::Arc;

/// Platform-specific continuous monitoring.
///
/// Implementing this is a separate engineering project per platform
/// (Windows minifilter, Apple Endpoint Security, Android app-scoped checks).
/// A file scanner does **not** implement it.
pub trait RealTimeMonitor: Send + Sync {
    /// Component state reported by the monitor itself.
    fn state(&self) -> ComponentState;
    /// Explanation for the current state.
    fn detail(&self) -> String;
    /// Version of the monitoring component, when it is active.
    fn version(&self) -> Option<String>;
    /// Platforms this monitor supports.
    fn platforms(&self) -> Vec<PlatformFamily>;
}

/// Aggregates the real state of every protection component.
pub struct ProtectionStatusProvider {
    scanner: Arc<dyn ScannerAdapter>,
    updates: Arc<dyn SignatureUpdateService>,
    quarantine: Option<Arc<dyn QuarantineService>>,
    monitor: Option<Arc<dyn RealTimeMonitor>>,
    audit_operational: bool,
    platform: PlatformFamily,
}

impl ProtectionStatusProvider {
    /// Builds a provider from the live components.
    pub fn new(
        scanner: Arc<dyn ScannerAdapter>,
        updates: Arc<dyn SignatureUpdateService>,
        quarantine: Option<Arc<dyn QuarantineService>>,
        monitor: Option<Arc<dyn RealTimeMonitor>>,
        audit_operational: bool,
        platform: PlatformFamily,
    ) -> Self {
        Self {
            scanner,
            updates,
            quarantine,
            monitor,
            audit_operational,
            platform,
        }
    }

    /// Probes every component and returns the snapshot.
    pub fn snapshot(&self) -> ProtectionSnapshot {
        let now = crate::audit::now_rfc3339();
        let mut components = Vec::new();

        components.push(self.scanner_component(&now));
        components.push(self.signature_component(&now));
        components.push(self.monitor_component(&now));
        components.push(self.quarantine_component(&now));
        components.push(self.update_component(&now));
        components.push(self.audit_component(&now));

        let engine_configured = components
            .iter()
            .any(|component| component.id == ComponentId::OnDemandScanner && component.state == ComponentState::Active);

        let fully_operational = components
            .iter()
            .all(|component| component.state == ComponentState::Active);

        ProtectionSnapshot {
            components,
            generated_at: now,
            fully_operational,
            engine_configured,
        }
    }

    fn scanner_component(&self, now: &str) -> ProtectionComponent {
        let descriptor = self.scanner.descriptor();
        let (state, detail, version, remediation) = if descriptor.available {
            (
                ComponentState::Active,
                format!(
                    "{} is configured and passed its self-check.",
                    descriptor.display_name
                ),
                descriptor.engine_version.clone(),
                None,
            )
        } else {
            (
                ComponentState::NotConfigured,
                descriptor
                    .unavailable_reason
                    .clone()
                    .unwrap_or_else(|| "No scanning engine is registered.".to_string()),
                None,
                Some("Configure a scanning engine to enable detection.".to_string()),
            )
        };

        ProtectionComponent {
            id: ComponentId::OnDemandScanner,
            label: ComponentId::OnDemandScanner.label().to_string(),
            description: "Runs user-initiated quick, full and custom scans.".to_string(),
            state,
            detail,
            version,
            platforms: vec![
                PlatformFamily::Windows,
                PlatformFamily::Macos,
                PlatformFamily::Linux,
            ],
            last_checked_at: descriptor.last_checked_at.clone().or_else(|| Some(now.to_string())),
            remediation,
        }
    }

    fn signature_component(&self, now: &str) -> ProtectionComponent {
        match self.updates.status() {
            Ok(status) => {
                let (state, detail, version) = match status.state {
                    crate::model::UpdateState::UpToDate => (
                        ComponentState::Active,
                        format!(
                            "Signature database {} is installed and current.",
                            status.installed_signature_version.clone().unwrap_or_default()
                        ),
                        status.installed_signature_version.clone(),
                    ),
                    crate::model::UpdateState::UpdateAvailable => (
                        ComponentState::Degraded,
                        "A newer signature database is available.".to_string(),
                        status.installed_signature_version.clone(),
                    ),
                    crate::model::UpdateState::NotConfigured => (
                        ComponentState::NotConfigured,
                        "No signature database is present because no engine is configured."
                            .to_string(),
                        None,
                    ),
                    crate::model::UpdateState::Failed => (
                        ComponentState::Error,
                        status
                            .error
                            .as_ref()
                            .map(|error| error.message.clone())
                            .unwrap_or_else(|| "The last update check failed.".to_string()),
                        status.installed_signature_version.clone(),
                    ),
                    crate::model::UpdateState::Checking => (
                        ComponentState::Degraded,
                        "Checking for signature updates.".to_string(),
                        status.installed_signature_version.clone(),
                    ),
                    crate::model::UpdateState::Unavailable => (
                        ComponentState::Unavailable,
                        "The update service could not be reached.".to_string(),
                        None,
                    ),
                };

                ProtectionComponent {
                    id: ComponentId::SignatureDatabase,
                    label: ComponentId::SignatureDatabase.label().to_string(),
                    description: "Detection signatures used by the scanning engine.".to_string(),
                    state,
                    detail,
                    version,
                    platforms: vec![
                        PlatformFamily::Windows,
                        PlatformFamily::Macos,
                        PlatformFamily::Linux,
                    ],
                    last_checked_at: status.last_checked_at.clone().or_else(|| Some(now.to_string())),
                    remediation: if status.state == crate::model::UpdateState::UpdateAvailable {
                        Some("Open the Update Center to install the latest signatures.".to_string())
                    } else {
                        None
                    },
                }
            }
            Err(error) => ProtectionComponent {
                id: ComponentId::SignatureDatabase,
                label: ComponentId::SignatureDatabase.label().to_string(),
                description: "Detection signatures used by the scanning engine.".to_string(),
                state: ComponentState::Error,
                detail: error.message,
                version: None,
                platforms: vec![
                    PlatformFamily::Windows,
                    PlatformFamily::Macos,
                    PlatformFamily::Linux,
                ],
                last_checked_at: Some(now.to_string()),
                remediation: None,
            },
        }
    }

    fn monitor_component(&self, now: &str) -> ProtectionComponent {
        let (state, detail, version, platforms) = match &self.monitor {
            Some(monitor) => (monitor.state(), monitor.detail(), monitor.version(), monitor.platforms()),
            None => (
                ComponentState::NotImplemented,
                "No native monitoring component exists yet. On-demand scanning does not provide continuous protection."
                    .to_string(),
                None,
                vec![PlatformFamily::Windows, PlatformFamily::Macos, PlatformFamily::Android],
            ),
        };

        ProtectionComponent {
            id: ComponentId::RealTimeMonitor,
            label: ComponentId::RealTimeMonitor.label().to_string(),
            description: "Continuous on-access monitoring of file activity.".to_string(),
            state,
            detail,
            version,
            platforms,
            last_checked_at: Some(now.to_string()),
            remediation: if state == ComponentState::NotImplemented {
                Some(
                    "Real-time protection requires a signed native driver per platform and is not part of Phase 1."
                        .to_string(),
                )
            } else {
                None
            },
        }
    }

    fn quarantine_component(&self, now: &str) -> ProtectionComponent {
        let (state, detail, remediation) = match &self.quarantine {
            Some(service) if service.is_operational() => (
                ComponentState::Active,
                "The quarantine vault is readable and ready to isolate detections.".to_string(),
                None,
            ),
            Some(_) => (
                ComponentState::Unavailable,
                "The quarantine vault could not be read.".to_string(),
                Some("Check the application data directory permissions.".to_string()),
            ),
            None => (
                ComponentState::NotImplemented,
                "Isolation is only performed for validated engine detections.".to_string(),
                Some("Configure a scanning engine to enable quarantine.".to_string()),
            ),
        };

        ProtectionComponent {
            id: ComponentId::QuarantineService,
            label: ComponentId::QuarantineService.label().to_string(),
            description: "Isolates detected files so they cannot execute.".to_string(),
            state,
            detail,
            version: Some(crate::CORE_VERSION.to_string()),
            platforms: vec![
                PlatformFamily::Windows,
                PlatformFamily::Macos,
                PlatformFamily::Linux,
            ],
            last_checked_at: Some(now.to_string()),
            remediation,
        }
    }

    fn update_component(&self, now: &str) -> ProtectionComponent {
        let status = self.updates.status();
        let (state, detail, checked) = match status {
            Ok(status) => (
                match status.state {
                    crate::model::UpdateState::UpToDate => ComponentState::Active,
                    crate::model::UpdateState::UpdateAvailable => ComponentState::Degraded,
                    crate::model::UpdateState::NotConfigured => ComponentState::NotConfigured,
                    crate::model::UpdateState::Failed => ComponentState::Error,
                    crate::model::UpdateState::Checking => ComponentState::Degraded,
                    crate::model::UpdateState::Unavailable => ComponentState::Unavailable,
                },
                status.message.clone(),
                status.last_checked_at.clone(),
            ),
            Err(error) => (ComponentState::Error, error.message.clone(), None),
        };

        ProtectionComponent {
            id: ComponentId::UpdateService,
            label: ComponentId::UpdateService.label().to_string(),
            description: "Authenticated, integrity-verified engine and signature updates."
                .to_string(),
            state,
            detail,
            version: Some(crate::CORE_VERSION.to_string()),
            platforms: vec![
                PlatformFamily::Windows,
                PlatformFamily::Macos,
                PlatformFamily::Linux,
            ],
            last_checked_at: checked.or_else(|| Some(now.to_string())),
            remediation: None,
        }
    }

    fn audit_component(&self, now: &str) -> ProtectionComponent {
        ProtectionComponent {
            id: ComponentId::AuditLog,
            label: ComponentId::AuditLog.label().to_string(),
            description: "Records security-relevant actions for review.".to_string(),
            state: if self.audit_operational {
                ComponentState::Active
            } else {
                ComponentState::Unavailable
            },
            detail: if self.audit_operational {
                "Audit records are being written.".to_string()
            } else {
                "The audit log is not writable.".to_string()
            },
            version: Some(crate::CORE_VERSION.to_string()),
            platforms: vec![
                PlatformFamily::Windows,
                PlatformFamily::Macos,
                PlatformFamily::Linux,
            ],
            last_checked_at: Some(now.to_string()),
            remediation: None,
        }
    }
}

/// Convenience helper: builds a snapshot from the default Phase 1 wiring.
pub fn phase_one_snapshot(
    scanner: Arc<dyn ScannerAdapter>,
    updates: Arc<dyn SignatureUpdateService>,
) -> Result<ProtectionSnapshot> {
    let provider = ProtectionStatusProvider::new(
        scanner,
        updates,
        None,
        None,
        true,
        PlatformFamily::Windows,
    );
    Ok(provider.snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::UnavailableScannerAdapter;
    use crate::updates::UnconfiguredUpdateService;

    fn snapshot_with(scanner: Arc<dyn ScannerAdapter>) -> ProtectionSnapshot {
        let provider = ProtectionStatusProvider::new(
            scanner,
            Arc::new(UnconfiguredUpdateService),
            None,
            None,
            true,
            PlatformFamily::Windows,
        );
        provider.snapshot()
    }

    fn find<'a>(
        snapshot: &'a ProtectionSnapshot,
        id: ComponentId,
    ) -> &'a ProtectionComponent {
        snapshot
            .components
            .iter()
            .find(|component| component.id == id)
            .expect("component should be reported")
    }

    #[test]
    fn with_no_engine_nothing_is_reported_as_active_except_the_audit_log() {
        let snapshot = snapshot_with(Arc::new(UnavailableScannerAdapter::default()));

        assert!(!snapshot.engine_configured);
        assert!(!snapshot.fully_operational);
        assert_eq!(
            find(&snapshot, ComponentId::OnDemandScanner).state,
            ComponentState::NotConfigured
        );
        assert_eq!(
            find(&snapshot, ComponentId::SignatureDatabase).state,
            ComponentState::NotConfigured
        );
        assert_eq!(
            find(&snapshot, ComponentId::RealTimeMonitor).state,
            ComponentState::NotImplemented
        );
        assert_eq!(
            find(&snapshot, ComponentId::QuarantineService).state,
            ComponentState::NotImplemented
        );
        assert_eq!(
            find(&snapshot, ComponentId::AuditLog).state,
            ComponentState::Active
        );
    }

    #[test]
    fn a_configured_scanner_makes_the_engine_available_but_not_the_product_complete() {
        let snapshot = snapshot_with(Arc::new(crate::scanner::FixtureScannerAdapter));

        assert!(snapshot.engine_configured);
        assert!(!snapshot.fully_operational, "real-time monitoring is missing");
        assert_eq!(
            find(&snapshot, ComponentId::OnDemandScanner).state,
            ComponentState::Active
        );
        assert_eq!(
            find(&snapshot, ComponentId::RealTimeMonitor).state,
            ComponentState::NotImplemented
        );
    }

    #[test]
    fn real_time_monitoring_is_never_claimed_without_a_monitor() {
        let snapshot = snapshot_with(Arc::new(crate::scanner::FixtureScannerAdapter));
        let monitor = find(&snapshot, ComponentId::RealTimeMonitor);
        assert_ne!(monitor.state, ComponentState::Active);
        assert!(monitor.detail.contains("does not provide continuous"));
    }

    #[test]
    fn every_component_reports_a_non_empty_detail() {
        let snapshot = snapshot_with(Arc::new(UnavailableScannerAdapter::default()));
        for component in &snapshot.components {
            assert!(!component.detail.trim().is_empty(), "{:?}", component.id);
            assert!(!component.label.trim().is_empty());
            assert!(!component.description.trim().is_empty());
        }
    }

    struct FakeMonitor;
    impl RealTimeMonitor for FakeMonitor {
        fn state(&self) -> ComponentState {
            ComponentState::PermissionRequired
        }
        fn detail(&self) -> String {
            "Full Disk Access has not been granted.".to_string()
        }
        fn version(&self) -> Option<String> {
            None
        }
        fn platforms(&self) -> Vec<PlatformFamily> {
            vec![PlatformFamily::Macos]
        }
    }

    #[test]
    fn a_registered_monitor_reports_its_own_state() {
        let provider = ProtectionStatusProvider::new(
            Arc::new(crate::scanner::FixtureScannerAdapter),
            Arc::new(UnconfiguredUpdateService),
            None,
            Some(Arc::new(FakeMonitor)),
            true,
            PlatformFamily::Macos,
        );
        let snapshot = provider.snapshot();
        assert_eq!(
            find(&snapshot, ComponentId::RealTimeMonitor).state,
            ComponentState::PermissionRequired
        );
    }
}
