//! Platform-specific security adapters.
//!
//! Each platform has its own module describing what is implemented, what is
//! planned and what the platform actually permits. Nothing here claims
//! protection that the platform has not granted.

use shieldforge_core::model::{NativeBridgeKind, PlatformFamily};

/// Compile-time family of the running binary.
pub fn family() -> PlatformFamily {
    #[cfg(target_os = "windows")]
    {
        PlatformFamily::Windows
    }
    #[cfg(target_os = "macos")]
    {
        PlatformFamily::Macos
    }
    #[cfg(target_os = "linux")]
    {
        PlatformFamily::Linux
    }
    #[cfg(target_os = "android")]
    {
        PlatformFamily::Android
    }
    #[cfg(target_os = "ios")]
    {
        PlatformFamily::Ios
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux",
        target_os = "android",
        target_os = "ios"
    )))]
    {
        PlatformFamily::Unknown
    }
}

/// CPU architecture of the running binary.
pub fn arch() -> &'static str {
    #[cfg(target_arch = "x86_64")]
    {
        "x86_64"
    }
    #[cfg(target_arch = "aarch64")]
    {
        "aarch64"
    }
    #[cfg(target_arch = "x86")]
    {
        "x86"
    }
    #[cfg(target_arch = "arm")]
    {
        "arm"
    }
    #[cfg(not(any(
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "x86",
        target_arch = "arm"
    )))]
    {
        "unknown"
    }
}

/// Human readable platform description for the UI.
pub fn detail() -> String {
    match family() {
        PlatformFamily::Windows => format!("Windows ({}) - desktop", arch()),
        PlatformFamily::Macos => format!("macOS ({}) - desktop", arch()),
        PlatformFamily::Linux => format!("Linux ({}) - desktop", arch()),
        PlatformFamily::Android => format!("Android ({}) - mobile", arch()),
        PlatformFamily::Ios => format!("iOS ({}) - mobile", arch()),
        PlatformFamily::Unknown => format!("Unknown ({})", arch()),
    }
}

/// The UI is always attached to native commands inside the shell.
pub fn native_bridge() -> NativeBridgeKind {
    NativeBridgeKind::Tauri
}

/// Platform-specific notes shown on the Protection Status page.
pub fn notes() -> PlatformNotes {
    match family() {
        PlatformFamily::Windows => PlatformNotes {
            on_access_monitoring: MonitorPlan {
                implemented: false,
                requirement: windows::REAL_TIME_REQUIREMENT.to_string(),
            },
            ..PlatformNotes::default()
        },
        PlatformFamily::Macos => PlatformNotes {
            on_access_monitoring: MonitorPlan {
                implemented: false,
                requirement: macos::REAL_TIME_REQUIREMENT.to_string(),
            },
            ..PlatformNotes::default()
        },
        PlatformFamily::Android => PlatformNotes {
            on_access_monitoring: MonitorPlan {
                implemented: false,
                requirement: android::REAL_TIME_REQUIREMENT.to_string(),
            },
            ..PlatformNotes::default()
        },
        _ => PlatformNotes::default(),
    }
}

/// Describes whether a platform capability exists and what it would require.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MonitorPlan {
    /// True only when a tested, shipped monitoring component exists.
    pub implemented: bool,
    /// What the platform requires before monitoring may be enabled.
    pub requirement: String,
}

/// Platform capability summary.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PlatformNotes {
    /// Continuous on-access monitoring.
    pub on_access_monitoring: MonitorPlan,
}

pub mod android;
pub mod macos;
pub mod windows;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_and_arch_are_reported() {
        assert_ne!(family(), PlatformFamily::Unknown);
        assert_ne!(arch(), "unknown");
        assert!(detail().contains(arch()));
    }

    #[test]
    fn monitoring_is_never_reported_as_implemented_in_phase_one() {
        assert!(!notes().on_access_monitoring.implemented);
    }

    #[test]
    fn the_shell_reports_the_tauri_bridge() {
        assert_eq!(native_bridge(), NativeBridgeKind::Tauri);
    }
}
