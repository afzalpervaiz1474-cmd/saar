# Testing

## Run the suites

```bash
npm install
npm run lint        # strict TypeScript check across the project
npm test            # 99 Vitest tests (unit + component + integration)
npm run build       # production bundle

npm run test:rust   # cargo test -p shieldforge-core  (needs rustc, works offline)
npm run test:all    # frontend + Rust
npm run verify      # lint + test + build
```

## What is covered

### Frontend (Vitest · jsdom · React Testing Library) — 99 tests, passing

| File | Covers |
|---|---|
| `lib/validation.test.ts` | Absolute/relative paths, traversal, NUL bytes, illegal characters (drive colon accepted), overlong paths, id grammars, numeric ranges |
| `lib/scanMachine.test.ts` | Start, engine-assigned job id adoption, progress, stale events, cancel (`running → cancelling → cancelled`), failure, unavailable, reset, elapsed time, indeterminate progress |
| `lib/statusTone.test.ts` | **Only** `active` maps to the ok tone; clean verdicts never claim safety; `overallTone` stays neutral while the engine is unconfigured |
| `lib/format.test.ts` | Byte/duration/timestamp/number formatting and their defensive branches |
| `lib/settings.test.ts` | Sanitisation, clamping, telemetry hard-lock, corrupt storage recovery, theme resolution |
| `lib/audit.test.ts` | Bounded merge, de-duplication, persistence, malformed-record rejection |
| `lib/history.test.ts` | `findLastScan`, filtering by kind/query/time window |
| `lib/native/bridge.test.ts` | Bridge detection, refusal of privileged commands without the shell, input validation before IPC, honest runtime reporting, error normalisation |
| `App.test.tsx` | Navigation to all nine pages, no green status without confirmation, unavailable states, theme switching, settings audit trail, quarantine empty state, client self-test (9/9 assertions) |
| `test/engine.integration.test.tsx` | Engine-backed flow through a mocked bridge: real component states, scan → results, failed scan, cancellation, quarantine deletion requiring typed confirmation, unconfigured engine, invalid custom path rejected before IPC, update failure, verdict filters |

Two product rules are enforced by tests rather than by convention:

1. `statusTone.test.ts` fails if any component state other than `active` maps to ok.
2. `engine.integration.test.tsx` fails if the UI renders results that the engine did not
   supply, or if a failed update leaves a stale “up to date” impression.

### Rust (std-only core) — written, not yet executed in this checkout

Unit tests live beside the code (`#[cfg(test)] mod tests`):

* `validation.rs` — the same hostile-input corpus as the frontend, plus the id grammars.
* `scanner.rs` — fixture detection, binary content reported as *unsupported* (never clean),
  cancellation, oversized files skipped, unavailable adapter reports `not_configured`.
* `scan.rs` — job lifecycle, concurrency limit (1), cancellation, unknown/malformed job
  ids, engine failure, deadline enforcement, bounded result store, synchronous mode.
* `quarantine.rs` — isolate → restore → delete, refusal to overwrite, traversal ids,
  missing file, missing detection name, audit records for every action.
* `updates.rs` — unsigned/invalid/empty/unversioned packages rejected, verified package
  accepted, unconfigured service reports `not_configured`.
* `audit.rs` — bounded retention, append-only file round-trip, compaction, corrupt-line
  handling, JSON round-trip fidelity.
* `protection.rs` — with no engine nothing is active except the audit log; a configured
  scanner marks the engine available but the product is still not fully operational;
  real-time monitoring is never claimed without a monitor.
* `adapters/clamav.rs` — well-formed, malformed and hostile `clamscan` output; missing
  binary reported as not configured; argument-vector execution.

Integration tests:

* `tests/engine_flow.rs` — harmless fixture → scan → detection → quarantine → restore →
  delete, with audit assertions; the same flow with no engine produces **no** detection
  and **no** quarantine; protection snapshot matches the wiring.
* `tests/security_inputs.rs` — traversal, NUL, illegal characters, overlong paths, hostile
  ids, hostile targets rejected before reaching the engine, permission failures reported,
  limits matching the frontend contract.

The harmless fixture is a purpose-built marker string
(`SHIELDFORGE-FIXTURE-MARKER-0001`), **not** the EICAR test file, so it does not trip
other vendors' products and is safe to keep in the repository. It produces a detection
only when the fixture engine is configured.

## Verification status of this checkout

| Check | Result |
|---|---|
| `npm run lint` (`tsc -b`, strict) | ✅ passed |
| `npm test` (99 tests) | ✅ passed |
| `npm run build` | ✅ built (`dist/`, 273 kB JS / 30 kB CSS) |
| `npm run tauri:dev` / `tauri:build` | ⚠️ not run — no Rust toolchain and no webview in the sandbox |
| `npm run test:rust` | ⚠️ not run — no `rustc`, no crates.io access in the sandbox |
| Rust lexical sanity check (balanced delimiters, terminated strings/comments across all `.rs` files) | ✅ passed |

The Rust code in this repository should be treated as **reviewed but uncompiled** until
someone runs `npm run test:rust` and `npm run tauri:build` on a machine with the Rust
toolchain. Everything in the UI is verified as described above.

## Test doubles, not fake data

The engine-backed integration tests inject fixtures through a **mocked native bridge**
(`vi.mock('@/lib/native/bridge')`). The application itself contains no code path that
manufactures a detection: with no bridge, the app renders explicit unavailable states,
which `App.test.tsx` asserts.
