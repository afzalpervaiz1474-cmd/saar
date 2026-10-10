//! Android platform notes.
//!
//! Android is a **separate Kotlin application**, not a build target of this
//! desktop crate. Device-wide file scanning is not permitted by the platform;
//! only app-scoped storage and user-initiated, consented checks are possible.
//! These constants document the contract the Kotlin app must honour.

/// What the Android platform permits.
pub const REAL_TIME_REQUIREMENT: &str = "Android does not permit device-wide scanning. The \
     Kotlin app may only scan app-scoped storage and user-granted folders, and must not claim \
     unrestricted device protection. Not started in Phase 1.";

/// Storage permissions the Kotlin app may request.
pub const PERMISSIONS: &str = "READ_MEDIA_* / Storage Access Framework only. No \
     MANAGE_EXTERNAL_STORAGE, no accessibility service, no device-admin.";

/// Shared result model version, so the Kotlin app stays wire-compatible.
pub const SHARED_MODEL_VERSION: &str = "1";
