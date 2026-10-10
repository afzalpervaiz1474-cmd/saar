//! Signature and engine updates.
//!
//! Security updates are a high-value target, so the policy implemented here is
//! deliberately conservative:
//!
//! * a package is trusted **only** after signature verification against a trust
//!   store - an unsigned or invalid package is rejected, never "trusted anyway";
//! * the Phase 1 service is [`UnconfiguredUpdateService`], which reports
//!   `not_configured` instead of inventing version numbers;
//! * `signatures_verified` is only ever `true` for a verified package.

use crate::error::{Error, ErrorCode, Result};
use crate::model::UpdateState;
use crate::model::UpdateStatus;
use std::time::{SystemTime, UNIX_EPOCH};

/// Verification outcome for an update package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verification {
    /// Signature verified against the trust store.
    Verified,
    /// Rejected, with the reason recorded.
    Rejected(RejectionReason),
}

impl Verification {
    /// True only for a verified package.
    pub fn is_verified(&self) -> bool {
        matches!(self, Verification::Verified)
    }
}

/// Why an update package was rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RejectionReason {
    /// No signature attached.
    MissingSignature,
    /// Signature did not verify against the trust store.
    InvalidSignature,
    /// Payload was empty or malformed.
    MalformedPackage,
    /// Version string was empty or malformed.
    InvalidVersion,
}

impl RejectionReason {
    /// Human readable explanation.
    pub fn message(self) -> &'static str {
        match self {
            RejectionReason::MissingSignature => "Update package is unsigned.",
            RejectionReason::InvalidSignature => "Update package signature is invalid.",
            RejectionReason::MalformedPackage => "Update package is empty or malformed.",
            RejectionReason::InvalidVersion => "Update package has an invalid version.",
        }
    }
}

/// Verifies update package signatures.
///
/// The default implementation in this crate is a placeholder that rejects
/// everything: a real product must plug in an offline signing key (ed25519 or
/// similar) before any update can be applied.
pub trait TrustStore: Send + Sync {
    /// Returns true only when `signature` is a valid signature of `payload`.
    fn verify(&self, payload: &[u8], signature: &[u8]) -> bool;
}

/// Placeholder trust store that verifies nothing.
#[derive(Debug, Default, Clone, Copy)]
pub struct UnconfiguredTrustStore;

impl TrustStore for UnconfiguredTrustStore {
    fn verify(&self, _payload: &[u8], _signature: &[u8]) -> bool {
        false
    }
}

/// A candidate update package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdatePackage {
    /// Version advertised by the package.
    pub version: String,
    /// Raw payload bytes.
    pub payload: Vec<u8>,
    /// Detached signature, when present.
    pub signature: Option<Vec<u8>>,
}

impl UpdatePackage {
    /// Verifies the package against a trust store.
    pub fn verify(&self, trust: &dyn TrustStore) -> Verification {
        if self.payload.is_empty() {
            return Verification::Rejected(RejectionReason::MalformedPackage);
        }
        if self.version.trim().is_empty() {
            return Verification::Rejected(RejectionReason::InvalidVersion);
        }
        match &self.signature {
            None => Verification::Rejected(RejectionReason::MissingSignature),
            Some(signature) if trust.verify(&self.payload, signature) => Verification::Verified,
            Some(_) => Verification::Rejected(RejectionReason::InvalidSignature),
        }
    }
}

/// Signature/engine update service.
pub trait SignatureUpdateService: Send + Sync {
    /// Last known status without contacting the network.
    fn status(&self) -> Result<UpdateStatus>;
    /// Contacts the configured source and reports the resulting status.
    fn check(&self) -> Result<UpdateStatus>;
}

/// The Phase 1 default: no update source is configured.
#[derive(Debug, Default, Clone, Copy)]
pub struct UnconfiguredUpdateService;

impl UnconfiguredUpdateService {
    fn status_of(&self, state: UpdateState, message: &str, error: Option<Error>) -> UpdateStatus {
        UpdateStatus {
            state,
            engine_version: Some(crate::CORE_VERSION.to_string()),
            installed_signature_version: None,
            installed_signature_released_at: None,
            latest_signature_version: None,
            last_checked_at: Some(now()),
            last_success_at: None,
            signatures_verified: false,
            message: message.to_string(),
            error,
        }
    }
}

impl SignatureUpdateService for UnconfiguredUpdateService {
    fn status(&self) -> Result<UpdateStatus> {
        Ok(self.status_of(
            UpdateState::NotConfigured,
            "No verified update source is configured.",
            None,
        ))
    }

    fn check(&self) -> Result<UpdateStatus> {
        Err(Error::not_configured(
            "No verified update source is configured.",
        )
        .with_hint("Configure a signed update channel before enabling automatic updates."))
    }
}

/// Local time as an RFC-3339 string (UTC).
fn now() -> String {
    crate::audit::now_rfc3339()
}

/// Seconds since the Unix epoch (used by platform adapters for staleness checks).
pub fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// A signature database that has been loaded from a verified package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureDatabase {
    /// Signature database version.
    pub version: String,
    /// Release timestamp of the database.
    pub released_at: Option<String>,
    /// Number of signatures loaded.
    pub signature_count: u64,
    /// True only when the package was verified before loading.
    pub verified: bool,
}

impl SignatureDatabase {
    /// Loads a database from a package, refusing anything unverified.
    pub fn from_package(package: &UpdatePackage, trust: &dyn TrustStore) -> Result<Self> {
        match package.verify(trust) {
            Verification::Verified => Ok(Self {
                version: package.version.clone(),
                released_at: Some(now()),
                signature_count: 0,
                verified: true,
            }),
            Verification::Rejected(reason) => Err(Error::new(
                ErrorCode::PermissionDenied,
                format!("Refusing to load update package: {}", reason.message()),
            )
            .with_hint("Only signed, integrity-verified packages are accepted.")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AlwaysValid;
    impl TrustStore for AlwaysValid {
        fn verify(&self, _payload: &[u8], _signature: &[u8]) -> bool {
            true
        }
    }

    fn package(signature: Option<Vec<u8>>) -> UpdatePackage {
        UpdatePackage {
            version: "27100".to_string(),
            payload: b"signature-data".to_vec(),
            signature,
        }
    }

    #[test]
    fn unsigned_packages_are_rejected() {
        let result = package(None).verify(&UnconfiguredTrustStore);
        assert_eq!(
            result,
            Verification::Rejected(RejectionReason::MissingSignature)
        );
        assert!(!result.is_verified());
    }

    #[test]
    fn invalid_signatures_are_rejected() {
        let result = package(Some(b"bad".to_vec())).verify(&UnconfiguredTrustStore);
        assert_eq!(
            result,
            Verification::Rejected(RejectionReason::InvalidSignature)
        );
    }

    #[test]
    fn verified_packages_are_accepted() {
        let result = package(Some(vec![1, 2, 3])).verify(&AlwaysValid);
        assert_eq!(result, Verification::Verified);
    }

    #[test]
    fn empty_or_unversioned_packages_are_rejected() {
        let empty = UpdatePackage {
            version: "1".to_string(),
            payload: vec![],
            signature: Some(vec![]),
        };
        assert_eq!(
            empty.verify(&AlwaysValid),
            Verification::Rejected(RejectionReason::MalformedPackage)
        );

        let unversioned = UpdatePackage {
            version: "  ".to_string(),
            payload: b"data".to_vec(),
            signature: Some(vec![]),
        };
        assert_eq!(
            unversioned.verify(&AlwaysValid),
            Verification::Rejected(RejectionReason::InvalidVersion)
        );
    }

    #[test]
    fn signature_databases_only_load_from_verified_packages() {
        let error = SignatureDatabase::from_package(&package(None), &UnconfiguredTrustStore)
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::PermissionDenied);

        let db =
            SignatureDatabase::from_package(&package(Some(vec![9])), &AlwaysValid).unwrap();
        assert!(db.verified);
        assert_eq!(db.version, "27100");
    }

    #[test]
    fn unconfigured_service_reports_not_configured() {
        let service = UnconfiguredUpdateService;
        let status = service.status().unwrap();
        assert_eq!(status.state, UpdateState::NotConfigured);
        assert!(!status.signatures_verified);
        assert_eq!(status.installed_signature_version, None);

        let error = service.check().unwrap_err();
        assert_eq!(error.code, ErrorCode::NotConfigured);
    }
}
