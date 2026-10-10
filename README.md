# ShieldForge Antivirus — Phase 1

A cross-platform security product under development. Phase 1 delivers a **runnable Windows
desktop application**: a premium security console, typed native security interfaces, an
automated test suite, and — most importantly — **honest component status**.

> ### Read this before anything else
>
> **ShieldForge does not detect malware yet.** No scanning engine is configured in this
> build, so scans report *“Scanner not configured”* and produce no results. Real-time
> protection is **not implemented** on any platform. There is no detection-rate data, no
> independent lab result and no benchmark for this product.
>
> This is a development milestone, not a replacement for an installed antivirus. Keep
> Windows Defender (or your platform's built-in protection) enabled.

---

## What is actually implemented

| Area | Status | Evidence |
|---|---|---|
| Nine-page security console (React + TypeScript + Tailwind) | ✅ Working | `npm run dev`, `npm test` |
| Real navigation, working settings, light/dark themes | ✅ Working | `src/App.test.tsx` |
| Typed native contract (Rust ⇄ TypeScript) | ✅ Working | `src/types/models.ts`, `shieldforge_core::model` |
| `ScannerAdapter` / `ScanJobManager` / `ScanResultRepository` | ✅ Implemented | `src-tauri/crates/shieldforge-core/src/{scanner,scan}.rs` |
| `QuarantineService` with safe vault handling | ✅ Implemented | `quarantine.rs` + tests |
| `SignatureUpdateService` + package verification policy | ✅ Implemented | `updates.rs` + tests |
| `SecurityAuditLog` (memory + append-only file) | ✅ Implemented | `audit.rs` + tests |
| `ProtectionStatusProvider` (honesty layer) | ✅ Implemented | `protection.rs` + tests |
| ClamAV command-line adapter (opt-in feature) | ⚠️ Written, engine not bundled | `src-tauri/src/adapters/clamav.rs` |
| Real-time / on-access monitoring | ❌ Not implemented | Reported as `Not implemented` in the UI |
| macOS (Swift) / Android (Kotlin) implementations | ❌ Not started | `docs/ROADMAP.md` |

**Verification status in this checkout** — see [docs/TESTING.md](docs/TESTING.md) for the
commands and the evidence:

* ✅ `npm run lint` (TypeScript, strict) — passes
* ✅ `npm test` (99 Vitest tests) — passes
* ✅ `npm run build` (production bundle) — succeeds
* ⚠️ **Rust: written but not compiled in this environment** — the sandbox has no Rust
  toolchain and no access to crates.io, so `cargo test` has **not** been run. The core
  crate is deliberately zero-dependency so that `cargo test -p shieldforge-core` works
  offline on any machine with `rustc`. Run it before trusting any Rust claim.

---

## Quick start

Requirements: **Node.js ≥ 20**, **Rust ≥ 1.77** (via [rustup](https://rustup.rs)) and the
[Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
git clone https://github.com/afzalpervaiz1474-cmd/saar.git
cd saar
npm install

npm run dev          # UI only, in a browser  (works without Rust)
npm run tauri:dev    # full desktop app        (needs Rust + webview)
```

The browser dev server is a **first-class mode**: with no native bridge attached, every
page renders its *unavailable* state instead of fake data. That is intentional and it is
covered by tests.

### Every command

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 1420 (browser preview mode) |
| `npm run build` | Type-check + production bundle into `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | TypeScript project-wide type check (`tsc -b`) |
| `npm test` | Vitest suite (unit + component + integration) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:rust` | `cargo test -p shieldforge-core` (**offline, std-only**) |
| `npm run test:all` | Frontend + Rust test suites |
| `npm run verify` | lint + test + build |
| `npm run icons` | Regenerate the application icons (pure Python) |
| `npm run tauri:dev` | Desktop app in dev mode |
| `npm run tauri:build` | Produce installers (MSI/NSIS on Windows) |

Packaging:

```bash
npm run tauri:build            # Windows: .msi + .exe installer in src-tauri/target/release/bundle
npm run tauri:build -- --debug # Debug build with devtools
```

### Enabling a real scanning engine (optional)

No engine ships with the repository. To try ClamAV (GPL-2.0-only — review redistribution
obligations before shipping):

```bash
# 1. install ClamAV yourself (e.g. winget install ClamAV.ClamAV; freshclam)
# 2. rebuild with the adapter enabled
npm run tauri:build -- --features clamav
```

For a self-check without installing anything, the harmless fixture engine can be enabled
in development only:

```bash
SHIELDFORGE_FIXTURE_SCANNER=1 npm run tauri:dev
```

It recognises one built-in marker string (`SHIELDFORGE-FIXTURE-MARKER-0001`) and nothing
else. It is a test instrument, never protection.

---

## Project structure

```
src/                       Frontend (React 18 + TypeScript + Tailwind + Lucide)
  types/models.ts          Wire contract, mirrored 1:1 in Rust
  lib/native/              Tauri IPC bridge + typed command wrappers
  lib/scanMachine.ts       Pure client-side scan state machine
  lib/statusTone.ts        The only place where a state becomes a colour
  lib/validation.ts        Input validation (mirror of the Rust validator)
  state/AppState.tsx       Single store connecting UI ⇄ native layer
  components/              Layout, UI primitives, protection cards
  pages/                   The nine console pages
  test/                    Fixtures and engine-backed integration tests

src-tauri/                 Tauri 2 shell (Rust)
  capabilities/default.json  Least-privilege ACL for the webview
  src/commands.rs          The complete command surface (14 commands)
  src/state.rs             Service wiring
  src/platform/            Windows / macOS / Android adapters & requirements
  src/adapters/clamav.rs   ClamAV adapter + hardened output parser
  crates/shieldforge-core/ Portable engine core — zero dependencies by default
    src/{model,validation,scan,scanner,quarantine,updates,audit,protection}.rs
    tests/{engine_flow,security_inputs}.rs

tools/generate_icons.py    Dependency-free icon generator
docs/                      Architecture, security, testing, roadmap, limitations
```

---

## Design principles

1. **Never fake a result.** No simulated scans, no invented detections, no placeholder
   “protected” badges. If a component cannot confirm it works, the UI says so.
2. **One place decides what “green” means.** `lib/statusTone.ts` maps only
   `ComponentState.Active` to the success tone; `protection.rs` only sets `Active` after a
   real probe. Both rules are enforced by tests.
3. **The engine is authoritative.** The UI never generates a job id, a verdict or a
   version; it renders what the native layer returned.
4. **Validate twice.** The UI validates for immediate feedback; Rust validates again
   before any filesystem or process operation.
5. **Windows Defender stays untouched.** ShieldForge neither disables nor bypasses any
   platform security control.
6. **Local-first, minimal data.** Scanning is local, preferences and the event log live on
   the device, and telemetry/cloud toggles are hard-locked off in Phase 1.

---

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, interfaces, data flow
* [docs/SECURITY.md](docs/SECURITY.md) — threat model, least privilege, update security
* [docs/TESTING.md](docs/TESTING.md) — how to run the suites and what they prove
* [docs/ROADMAP.md](docs/ROADMAP.md) — Windows → macOS → Android plan
* [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — everything that is missing or unverified

## License

The project code is licensed under **MIT OR Apache-2.0** (pick either). Third-party
components keep their own licences (React/MIT, Tauri/MIT-Apache-2.0, Tailwind/MIT,
Lucide/ISC). ClamAV is GPL-2.0-only and is **not** redistributed here.
