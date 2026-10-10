//! Windows platform notes.
//!
//! Phase 1 target: on-demand scanning only.

/// What real-time protection would require on Windows.
pub const REAL_TIME_REQUIREMENT: &str = "A signed kernel minifilter driver plus a reviewed, \
     least-privilege service. Not started in Phase 1; ShieldForge never disables Microsoft \
     Defender or tampers with Windows Security.";

/// Default quick-scan locations on Windows.
pub fn quick_scan_targets() -> Vec<String> {
    // Deliberately conservative: user profile, temp and startup locations only.
    let mut targets = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        targets.push(profile);
    }
    if let Ok(temp) = std::env::var("TEMP") {
        targets.push(temp);
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        targets.push(format!(
            "{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
            appdata
        ));
    }
    targets
}

/// Fixed drives offered to a full scan (root-only, engine expands them).
pub fn full_scan_targets() -> Vec<String> {
    ('C'..='Z')
        .filter(|letter| std::path::Path::new(&format!("{letter}:\\")).exists())
        .map(|letter| format!("{letter}:\\"))
        .collect()
}
