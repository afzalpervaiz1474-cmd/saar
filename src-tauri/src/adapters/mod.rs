//! Engine adapters registered with the desktop shell.

pub mod clamav;

use shieldforge_core::scanner::ScannerAdapter;
use std::sync::Arc;

/// Chooses the scanner adapter for this build.
///
/// Priority:
/// 1. `clamav` feature enabled **and** the binary present → ClamAV adapter;
/// 2. `SHIELDFORGE_FIXTURE_SCANNER=1` → harmless fixture scanner (development/test only);
/// 3. otherwise → the unavailable adapter, which reports `not_configured`.
pub fn default_scanner() -> Arc<dyn ScannerAdapter> {
    #[cfg(feature = "clamav")]
    {
        let adapter = clamav::ClamAvAdapter::probe(clamav::CLAMSCAN_BIN);
        if adapter.is_available() {
            return Arc::new(adapter);
        }
        if fixture_enabled() {
            return Arc::new(shieldforge_core::scanner::FixtureScannerAdapter);
        }
        return Arc::new(shieldforge_core::scanner::UnavailableScannerAdapter::new(
            "ClamAV was configured at build time but no usable binary was found.",
        ));
    }

    #[cfg(not(feature = "clamav"))]
    {
        if fixture_enabled() {
            // Development aid only: recognises a harmless marker string and
            // nothing else. It is never a substitute for a real engine.
            return Arc::new(shieldforge_core::scanner::FixtureScannerAdapter);
        }
        Arc::new(shieldforge_core::scanner::UnavailableScannerAdapter::default())
    }
}

fn fixture_enabled() -> bool {
    matches!(std::env::var("SHIELDFORGE_FIXTURE_SCANNER").as_deref(), Ok("1"))
}
