# Known limitations

Everything below is true of this build. Nothing here is a hidden caveat — the application
surfaces most of these in the UI as well (Protection Status and About & Diagnostics).

## Detection

* **No scanning engine is configured.** Scans report “Scanner not configured” and produce
  no results. Scan buttons are disabled with the reason shown.
* The ClamAV adapter is written but disabled by default (feature `clamav`) and requires a
  user-installed binary. ClamAV is GPL-2.0-only: redistribution obligations must be
  reviewed before shipping it with a product.
* The fixture engine recognises one harmless marker string and exists for tests only.
* **No detection-rate data, no benchmark, no independent lab result exists for this
  product.** Any effectiveness claim would be unsupported.

## Protection

* **Real-time / on-access monitoring is not implemented** on any platform. It is reported
  as `Not implemented` in the UI.
* On-demand scanning and real-time monitoring are different engineering problems; a file
  scanner does not provide continuous protection.
* Signature database status is `Not configured` because there is no engine and no
  signature source.
* Quarantine requires a validated engine detection, so with no engine the vault stays
  empty by design — not because the feature is broken.

## Updates

* No update source is configured; `Check for updates` reports `not_configured`.
* The verification policy exists (signed packages only) but the default trust store
  rejects everything, because no signing key has been provisioned.
* No rollback, no staged rollout, no delta updates.

## Platform coverage

* Windows is the only implemented target. macOS (Swift / Endpoint Security) and Android
  (Kotlin) are design-level only; **no code exists** for them.
* Full/quick scan location lists are implemented for Windows and macOS; on Linux they are
  minimal (`$HOME`, `/tmp`).
* The Windows installer is unsigned in this repository.

## Security hardening still missing

* The audit log is append-only but **not tamper-proof** (no hash chaining, no OS-level
  protection).
* No application self-protection or anti-tamper.
* No rate limiting on scan job creation beyond the single-concurrency cap.
* The webview CSP allows `style-src 'unsafe-inline'` (required by Tailwind's runtime
  classes); tightening it further needs a build-time CSS pipeline change.
* `capabilities/default.json` uses Tauri 2 `allow-<command>` permission identifiers;
  verify them against the generated schema (`src-tauri/gen/schemas/`) on first build.

## Verification gaps in this checkout

* The **Rust layer has not been compiled or tested** — the authoring sandbox had no Rust
  toolchain and no network access to crates.io. Run `npm run test:rust` and
  `npm run tauri:build` before relying on any Rust claim.
* The desktop application has not been run as a packaged binary (no Windows host, no
  webview in the sandbox). The UI was verified through `npm run dev`, `npm test` and
  `npm run build`.
* Accessibility has been addressed at the component level (labels, roles, focus rings,
  `prefers-reduced-motion`) but has not gone through a formal audit or screen-reader pass.
* No performance profiling has been done on large directory trees.

## Deliberate non-goals for Phase 1

* No privileged Windows service.
* No telemetry backend, no cloud analysis, no accounts, no subscriptions.
* No interference with Microsoft Defender or any other platform security control.
