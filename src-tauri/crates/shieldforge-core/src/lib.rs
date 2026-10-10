//! `shieldforge-core` - the portable security engine core.
//!
//! This crate holds the domain model, validation rules and the component
//! interfaces that every platform implementation shares:
//!
//! | Module        | Responsibility                                              |
//! |---------------|-------------------------------------------------------------|
//! | `model`       | Wire types shared with the UI (mirrored in TypeScript)       |
//! | `error`       | Typed errors with stable codes                               |
//! | `validation`  | Strict input validation (authoritative, not advisory)        |
//! | `scanner`     | `ScannerAdapter` trait + unavailable/fixture adapters        |
//! | `scan`        | `ScanJobManager`, `ScanResultRepository`                     |
//! | `quarantine`  | `QuarantineService` with safe vault handling                 |
//! | `updates`     | `SignatureUpdateService` + package verification policy       |
//! | `audit`       | `SecurityAuditLog` (memory + append-only file)               |
//! | `protection`  | `ProtectionStatusProvider` - the honesty layer               |
//!
//! Design rules enforced here:
//!
//! 1. **No fabrication.** A component reports `active` only after it proves it
//!    works. Everything else reports `not_configured` / `not_implemented` /
//!    `unavailable` / `permission_required` / `error`.
//! 2. **No ambient authority.** Paths, ids and limits are validated before any
//!    filesystem or process operation.
//! 3. **Bounded resources.** Job registry, result cache and audit log all have
//!    explicit caps.
//! 4. **std only.** No third-party crates by default, so the core can be built
//!    and tested without network access.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(clippy::all)]

pub mod audit;
pub mod error;
pub mod json;
pub mod model;
pub mod protection;
pub mod quarantine;
pub mod scan;
pub mod scanner;
pub mod updates;
pub mod validation;

pub use error::{Error, ErrorCode, Result};
pub use model::{
    AppInfo, AuditEvent, ComponentId, ComponentState, Detection, HistoryKind, Outcome,
    PlatformFamily, ProtectionComponent, ProtectionSnapshot, QuarantineItem, ScanFileResult,
    ScanJobStatus, ScanProfile, ScanProgress, ScanSummary, ScanVerdict, ScannerCapabilities,
    ScannerDescriptor, ScannerKind, ThreatCategory, UpdateState, UpdateStatus,
};
pub use protection::{ProtectionStatusProvider, RealTimeMonitor};
pub use quarantine::{QuarantineRequest, QuarantineService, VaultQuarantineService};
pub use scan::{ScanJobManager, ScanOptions, ScanRequest, ScanResultRepository};
pub use scanner::{
    FixtureScannerAdapter, NoopScanEventSink, ScanEventSink, ScannerAdapter,
    UnavailableScannerAdapter,
};
pub use updates::{SignatureUpdateService, UnconfiguredUpdateService};

/// Crate version, reported by the diagnostics command.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Product name used in audit records and window titles.
pub const PRODUCT_NAME: &str = "ShieldForge Antivirus";
