# Architecture

ShieldForge is split into three layers with a single, typed contract between them. The
split exists so that the security-critical parts can be reused (and tested) on every
platform, while the UI stays a rendering layer with no privileges of its own.

```
┌───────────────────────────────────────────────────────────────────┐
│  Webview UI (React 18 · TypeScript · Tailwind · Lucide)            │
│  • renders native data, never invents it                           │
│  • validates inputs for fast feedback (non-authoritative)          │
│  • 9 pages, no privileged access of any kind                       │
└───────────────▲──────────────────────────────┬─────────────────────┘
                │ typed commands (IPC)          │ typed results / errors
                │                               ▼
┌───────────────┴───────────────────────────────────────────────────┐
│  Tauri 2 shell  (src-tauri/src)                                    │
│  • commands.rs  — the complete, audited command surface (14)       │
│  • state.rs     — service wiring, one instance per process         │
│  • platform/    — Windows / macOS / Android adapters & notes       │
│  • adapters/    — engine adapters (ClamAV, fixture)                │
│  • capabilities/default.json — least-privilege ACL                 │
└───────────────▲──────────────────────────────┬─────────────────────┘
                │                               ▼
┌───────────────┴───────────────────────────────────────────────────┐
│  shieldforge-core  (portable, zero third-party dependencies)       │
│  model · validation · scanner · scan · quarantine · updates ·      │
│  audit · protection                                                │
└───────────────────────────────────────────────────────────────────┘
```

## Why the core crate has no dependencies

`shieldforge-core` compiles with `rustc` alone. `serde` is behind an optional feature that
only the desktop shell enables. Consequences:

* `cargo test -p shieldforge-core` runs **offline** — no crates.io, no network, no build
  cache surprises — which makes the security-critical logic auditable and reproducible;
* the same crate can be consumed by the future Kotlin (JNI) and Swift (FFI) front-ends;
* the dependency surface of the security core is zero, so supply-chain review is limited
  to the shell layer.

## The contract

`src/types/models.ts` and `shieldforge_core::model` are field-for-field mirrors. Changing
one without the other is a bug; both sides use `snake_case` on the wire and every enum
carries an explicit `as_str()` so the serialised values cannot drift.

Invariants the UI must respect (enforced by `src/lib/statusTone.test.ts`):

* only `ComponentState.Active` renders as the success (“ok”) tone;
* `ScanJobStatus.Completed` is the only ok scan state; `unavailable` is never ok;
* a `clean` verdict is always accompanied by “not a guarantee of safety”;
* `overallTone()` returns green only when **every** component is active.

## Interfaces

| Interface | Responsibility | Phase 1 implementation |
|---|---|---|
| `ScannerAdapter` | Inspect files, report verdicts | `UnavailableScannerAdapter` (default), `FixtureScannerAdapter` (dev/test), `ClamAvAdapter` (feature) |
| `ScanJobManager` | Validation, concurrency limit, progress, cancel, deadline | std-thread based, 1 concurrent job |
| `ScanResultRepository` | Persist summaries for the results view | bounded in-memory store (20) |
| `QuarantineService` | Isolate, restore, delete | `VaultQuarantineService` (app data dir) |
| `SignatureUpdateService` | Report/check updates | `UnconfiguredUpdateService` |
| `ProtectionStatusProvider` | Probe components, build the snapshot | probes every component on each call |
| `SecurityAuditLog` | Append-only record of actions | `FileAuditLog` (JSON lines) + `InMemoryAuditLog` |
| `RealTimeMonitor` | Continuous monitoring | **none** — always reported as `Not implemented` |

## Scan flow

```
UI "Start scan"
  → commands::scan_start            (validate profile + every target)
  → ScanJobManager::start           (reject if engine unavailable / busy)
      ├─ thread spawns ScannerAdapter::scan(request, sink)
      ├─ sink.on_progress  → job registry (bounded updates)
      ├─ sink.is_cancelled → engine stops at next checkpoint
      └─ on finish: status + summary stored, deadline checked
  → UI polls scan_progress every 750 ms (only while the job is active)
  → UI fetches scan_results once the job reaches a terminal state
```

The **engine assigns the job id** and the UI adopts it from the first progress event. An
earlier revision generated the id in the UI and silently ignored every engine event
because the ids did not match — the integration test now covers this.

## Failure and honesty model

Every command returns either engine data or a typed `Error` with a stable code
(`bridge_unavailable`, `not_configured`, `not_implemented`, `permission_denied`,
`invalid_input`, `not_found`, `cancelled`, `engine_error`, `internal`). The UI renders
those codes as explicit states — it never substitutes a default value, and it never
shows a green status for a component that did not confirm it.

## Settings and privacy

Preferences and the local event log are stored on the device
(`shieldforge.settings.v1`, `shieldforge.audit.v1` in `localStorage` on the web; the
application data directory in the desktop build). Telemetry and cloud lookup toggles are
hard-locked off in `sanitizeSettings()` — there is no backend that could receive data, and
enabling them is impossible from the UI.
