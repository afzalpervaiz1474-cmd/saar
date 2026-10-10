//! macOS platform notes.
//!
//! Planned as a native Swift security adapter. Nothing is implemented yet:
//! system-level monitoring on macOS requires Apple's Endpoint Security
//! framework, specific entitlements, notarisation and user-granted permissions.

/// What real-time protection would require on macOS.
pub const REAL_TIME_REQUIREMENT: &str = "Apple Endpoint Security entitlement, a notarised and \
     signed system extension, Full Disk Access and user consent. Not started in Phase 1.";

/// Sandbox/permission notes surfaced in Settings.
pub const PERMISSIONS: &str = "macOS builds will request Full Disk Access for user-selected \
     folders only; no entitlement is requested in Phase 1.";

/// Default quick-scan locations on macOS.
pub fn quick_scan_targets() -> Vec<String> {
    let mut targets = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        targets.push(format!("{home}/Downloads"));
        targets.push(format!("{home}/Documents"));
        targets.push(format!("{home}/Library/LaunchAgents"));
    }
    targets.push("/tmp".to_string());
    targets
}

/// Full-scan roots on macOS.
pub fn full_scan_targets() -> Vec<String> {
    let mut targets = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        targets.push(home);
    }
    targets.push("/Applications".to_string());
    targets
}
