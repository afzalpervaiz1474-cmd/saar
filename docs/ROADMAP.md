# Cross-platform roadmap

ShieldForge shares **concepts, branding, API contracts and result models** across
platforms. Native protection is implemented separately per platform, because each
platform exposes (and permits) something different.

## Phase 1 — Windows desktop (this release)

* ✅ Security console (9 pages), settings, themes, navigation
* ✅ Native interfaces: scanner, job manager, result store, quarantine, updates, audit,
  protection status
* ✅ Honest component states and automated tests
* ⬜ Scanning engine integration (ClamAV adapter written; needs a real installation and a
  licensing review before it can ship)
* ⬜ Windows packaging: code signing certificate, MSI/NSIS configuration, versioning

## Phase 2 — Windows real-time protection (separate project)

A file scanner is not a monitor. Continuous protection on Windows requires:

* a signed kernel minifilter driver (or an equivalent supported mechanism);
* a least-privilege, independently reviewed service to host it;
* driver signing via the Windows Hardware Developer Program and an EV certificate;
* a defined policy for what happens on detection (block, prompt, quarantine);
* interoperability testing to prove Microsoft Defender is unaffected.

None of this is started. It will not ship without independent review and testing.

## Phase 3 — macOS (Swift security adapter)

* Native Swift adapter that consumes `shieldforge-core` through a C FFI boundary
  (the core crate builds with no third-party dependencies, which keeps this feasible).
* Evaluate **Apple Endpoint Security** for on-access monitoring: entitlement application,
  system extension distribution, notarisation, and user consent (Full Disk Access).
* Sandboxing, hardened runtime and signing requirements before any release.
* Expect to ship **on-demand scanning first**; system-level monitoring last.

## Phase 4 — Android (separate Kotlin application)

Android is a **different app**, not a build target of this crate:

* Kotlin + Jetpack Compose UI following the same information architecture;
* share the result model (`docs`: `src/types/models.ts` ↔ `shieldforge_core::model`) so
  history, verdicts and audit semantics stay identical;
* **no device-wide scanning** — the platform does not permit it. Only app-scoped storage
  and user-granted folders (Storage Access Framework, `READ_MEDIA_*`) may be scanned;
* never request `MANAGE_EXTERNAL_STORAGE`, device-admin or accessibility services for
  scanning features;
* background work through foreground services with explicit user notification.

## Shared across all platforms

| Concern | Approach |
|---|---|
| Result model | One contract (`ScanFileResult`, `Detection`, verdicts) implemented in Rust and mirrored per platform |
| Audit semantics | Same event kinds and outcomes everywhere; storage is platform-appropriate |
| Update model | Authenticated, integrity-verified packages only; no unsigned updates on any platform |
| Honesty rules | A component reports `active` only after it proves it; the UI colours only `active` green |
| Privacy | Local-first scanning, minimal data collection, explicit consent for anything that leaves the device |

## Explicitly not planned

* Disabling or replacing the platform's built-in antivirus.
* Kernel/root-level components without independent security review.
* Cloud-based file upload for analysis without explicit, informed, per-file consent.
* Claims of detection effectiveness without independent lab evidence.
