//! Typed errors.
//!
//! Every error carries a stable `ErrorCode` that the UI maps to a message and a
//! remediation hint. Error messages must never contain secrets, tokens or the
//! full contents of a user file.

use core::fmt;

/// Stable error codes shared with the frontend (`NativeErrorCode` in TypeScript).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ErrorCode {
    /// The UI is not connected to the native layer (e.g. running in a browser).
    BridgeUnavailable,
    /// The feature exists but has no implementation on this platform yet.
    NotImplemented,
    /// The component exists but nothing is configured (the Phase 1 default).
    NotConfigured,
    /// The operating system denied the operation.
    PermissionDenied,
    /// Input failed validation.
    InvalidInput,
    /// Referenced object does not exist.
    NotFound,
    /// The user cancelled the operation.
    Cancelled,
    /// The scan engine failed.
    EngineError,
    /// Unexpected internal failure.
    Internal,
}

impl ErrorCode {
    /// Wire representation, identical to the TypeScript union members.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::BridgeUnavailable => "bridge_unavailable",
            ErrorCode::NotImplemented => "not_implemented",
            ErrorCode::NotConfigured => "not_configured",
            ErrorCode::PermissionDenied => "permission_denied",
            ErrorCode::InvalidInput => "invalid_input",
            ErrorCode::NotFound => "not_found",
            ErrorCode::Cancelled => "cancelled",
            ErrorCode::EngineError => "engine_error",
            ErrorCode::Internal => "internal",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Structured error returned by every fallible core operation.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Error {
    /// Stable machine-readable code.
    pub code: ErrorCode,
    /// Short, user-presentable message.
    pub message: String,
    /// Optional actionable hint.
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub hint: Option<String>,
    /// Correlation id for log/audit lookup.
    #[cfg_attr(feature = "serde", serde(skip_serializing_if = "Option::is_none"))]
    pub trace_id: Option<String>,
}

impl Error {
    /// Creates an error with the given code and message.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            hint: None,
            trace_id: None,
        }
    }

    /// Attaches a remediation hint.
    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    /// Attaches a correlation id.
    pub fn with_trace_id(mut self, trace_id: impl Into<String>) -> Self {
        self.trace_id = Some(trace_id.into());
        self
    }

    /// `invalid_input` shorthand.
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidInput, message)
    }

    /// `not_configured` shorthand.
    pub fn not_configured(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotConfigured, message)
    }

    /// `not_implemented` shorthand.
    pub fn not_implemented(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotImplemented, message)
    }

    /// `permission_denied` shorthand.
    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::PermissionDenied, message)
    }

    /// `not_found` shorthand.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for Error {}

/// Convenience alias used throughout the crate.
pub type Result<T> = core::result::Result<T, Error>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_match_the_typescript_contract() {
        assert_eq!(ErrorCode::BridgeUnavailable.as_str(), "bridge_unavailable");
        assert_eq!(ErrorCode::NotConfigured.as_str(), "not_configured");
        assert_eq!(ErrorCode::PermissionDenied.as_str(), "permission_denied");
        assert_eq!(ErrorCode::NotImplemented.as_str(), "not_implemented");
    }

    #[test]
    fn builders_attach_metadata() {
        let error = Error::invalid("bad path")
            .with_hint("use an absolute path")
            .with_trace_id("tr-9");
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert_eq!(error.hint.as_deref(), Some("use an absolute path"));
        assert_eq!(error.trace_id.as_deref(), Some("tr-9"));
    }

    #[test]
    fn display_includes_the_code() {
        let rendered = Error::not_configured("no engine").to_string();
        assert!(rendered.contains("not_configured"));
        assert!(rendered.contains("no engine"));
    }
}
