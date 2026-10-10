//! Input validation.
//!
//! This module is the authoritative validator: the UI has a mirror of these
//! rules for immediate feedback, but every value crosses this boundary again
//! before it reaches the filesystem or a subprocess.
//!
//! Rules:
//! * custom scan targets must be absolute;
//! * `..` is rejected outright (never resolved away);
//! * NUL and other illegal characters are rejected;
//! * quarantine and job ids must match the generated-id grammar;
//! * numeric preferences are range checked.

use crate::error::{Error, Result};
use crate::model::ScanProfile;

/// Maximum accepted path length (Windows extended-length territory).
pub const MAX_PATH_LENGTH: usize = 32_767;

/// Minimum/maximum values accepted for the numeric preferences.
pub struct Limits {
    /// Max file size in MiB.
    pub max_file_size_mb: (u64, u64),
    /// Job timeout in minutes.
    pub max_duration_minutes: (u64, u64),
    /// History retention in days.
    pub keep_history_days: (u64, u64),
    /// Rows per page in the results view.
    pub results_page_size: (u64, u64),
}

/// Supported ranges, mirrored in `src/lib/validation.ts`.
pub const LIMITS: Limits = Limits {
    max_file_size_mb: (1, 4096),
    max_duration_minutes: (1, 720),
    keep_history_days: (1, 365),
    results_page_size: (5, 200),
};

/// Characters that are illegal in Windows paths and useless elsewhere.
/// The drive colon is handled separately (see [`validate_scan_path`]).
const ILLEGAL_CHARS: &[char] = &['<', '>', ':', '"', '|', '?', '*'];

fn has_illegal_chars(value: &str) -> bool {
    value
        .chars()
        .any(|c| ILLEGAL_CHARS.contains(&c) || c.is_control())
}

/// Validates a user-supplied scan target.
pub fn validate_scan_path(raw: &str) -> Result<()> {
    let path = raw.trim();

    if path.is_empty() {
        return Err(Error::invalid("Enter a folder path to scan."));
    }
    if path.len() > MAX_PATH_LENGTH {
        return Err(Error::invalid(format!(
            "Path exceeds {MAX_PATH_LENGTH} characters."
        )));
    }
    if path.contains('\0') {
        // NUL terminates C strings and is a classic truncation/validation bypass.
        return Err(Error::invalid("Path contains a null byte."));
    }
    if path.contains("..") {
        return Err(Error::invalid(
            "Relative segments (\"..\") are not allowed. Use an absolute path.",
        ));
    }

    let is_windows_absolute = path.len() >= 3
        && path.as_bytes()[0].is_ascii_alphabetic()
        && path.as_bytes()[1] == b':'
        && (path.as_bytes()[2] == b'\\' || path.as_bytes()[2] == b'/');
    let is_unix_absolute = path.starts_with('/');

    if !is_windows_absolute && !is_unix_absolute {
        return Err(Error::invalid(
            "Use an absolute path, for example C:\\Users\\you or /home/you.",
        ));
    }

    // The drive colon is legal; every other illegal character is not.
    let remainder = if is_windows_absolute { &path[2..] } else { path };
    if has_illegal_chars(remainder) {
        return Err(Error::invalid(
            "Path contains characters that are not valid in a filesystem path.",
        ));
    }

    Ok(())
}

/// Parses and validates a scan profile name.
pub fn validate_scan_profile(raw: &str) -> Result<ScanProfile> {
    ScanProfile::parse(raw)
}

/// Validates an engine-generated quarantine id (`qtn_<base32-ish>`).
///
/// The grammar is the only thing standing between user input and a filesystem
/// path inside the vault, so it is deliberately strict.
pub fn validate_quarantine_id(raw: &str) -> Result<()> {
    if raw.is_empty() {
        return Err(Error::invalid("Missing quarantine item id."));
    }
    if raw.len() > 128 {
        return Err(Error::invalid("Quarantine id is too long."));
    }
    let body = raw.strip_prefix("qtn_").ok_or_else(|| Error::invalid("Malformed quarantine id."))?;
    if body.len() < 4 || !body.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(Error::invalid("Malformed quarantine id."));
    }
    Ok(())
}

/// Validates an engine-generated job id (`job_<base32-ish>`).
pub fn validate_job_id(raw: &str) -> Result<()> {
    if raw.is_empty() {
        return Err(Error::invalid("Missing scan job id."));
    }
    let body = raw.strip_prefix("job_").ok_or_else(|| Error::invalid("Malformed scan job id."))?;
    if body.len() < 4
        || body.len() > 64
        || !body.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(Error::invalid("Malformed scan job id."));
    }
    Ok(())
}

/// Range-checks a numeric preference.
pub fn validate_range(value: u64, min: u64, max: u64) -> Result<()> {
    if value < min || value > max {
        return Err(Error::invalid(format!(
            "Value must be between {min} and {max}."
        )));
    }
    Ok(())
}

/// Rejects `..` and NUL in any component that will be joined onto a vault path.
pub fn is_safe_single_component(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('\0')
        && !value.contains("..")
        && !value.contains('/')
        && !value.contains('\\')
        && !has_illegal_chars(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_absolute_paths() {
        assert!(validate_scan_path("/home/tester/Documents").is_ok());
        assert!(validate_scan_path("C:\\Users\\tester").is_ok());
        assert!(validate_scan_path("D:/data").is_ok());
    }

    #[test]
    fn rejects_empty_relative_and_traversal() {
        assert!(validate_scan_path("").is_err());
        assert!(validate_scan_path("   ").is_err());
        assert!(validate_scan_path("Documents/files").is_err());
        assert!(validate_scan_path("/var/../etc").is_err());
        assert!(validate_scan_path("C:\\Users\\..\\Windows").is_err());
    }

    #[test]
    fn rejects_null_bytes() {
        assert!(validate_scan_path("/home/tester\0evil").is_err());
    }

    #[test]
    fn rejects_illegal_characters_but_allows_the_drive_colon() {
        assert!(validate_scan_path("C:\\Users\\tester").is_ok());
        assert!(validate_scan_path("/home/tester/*.txt").is_err());
        assert!(validate_scan_path("/home/tester/a|b").is_err());
        assert!(validate_scan_path("/home/tester/a\u{1}b").is_err());
    }

    #[test]
    fn rejects_overlong_paths() {
        let long = format!("/{}", "a".repeat(MAX_PATH_LENGTH + 1));
        assert!(validate_scan_path(&long).is_err());
    }

    #[test]
    fn quarantine_ids_must_match_the_generated_grammar() {
        assert!(validate_quarantine_id("qtn_9fA2bC3d").is_ok());
        assert!(validate_quarantine_id("../../etc/passwd").is_err());
        assert!(validate_quarantine_id("qtn_").is_err());
        assert!(validate_quarantine_id("").is_err());
        assert!(validate_quarantine_id("qtn_ab/cd").is_err());
    }

    #[test]
    fn job_ids_must_match_the_generated_grammar() {
        assert!(validate_job_id("job_abc123").is_ok());
        assert!(validate_job_id("job_").is_err());
        assert!(validate_job_id("../../job").is_err());
    }

    #[test]
    fn ranges_are_inclusive() {
        assert!(validate_range(1, 1, 4096).is_ok());
        assert!(validate_range(4096, 1, 4096).is_ok());
        assert!(validate_range(0, 1, 4096).is_err());
        assert!(validate_range(4097, 1, 4096).is_err());
    }

    #[test]
    fn single_component_helper_blocks_escapes() {
        assert!(is_safe_single_component("qtn_abc123"));
        assert!(!is_safe_single_component(".."));
        assert!(!is_safe_single_component("a/b"));
        assert!(!is_safe_single_component("a\\b"));
        assert!(!is_safe_single_component(""));
    }
}
