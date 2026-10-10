/**
 * ShieldForge shared contract.
 *
 * These types are the authoritative, serialisable contract between the Rust
 * native layer (`src-tauri`) and the React UI. Every field here is mirrored by a
 * `serde`-derived struct/enum in `src-tauri/crates/shieldforge-core/src/model.rs`.
 *
 * Rules that the UI must obey (enforced by review + tests):
 *  - `ComponentState` is only ever rendered as "healthy/green" for `active`.
 *  - Nothing in this file may be synthesised by the frontend. If the native side
 *    does not supply a value, the field stays `null` and the UI shows an
 *    explicit unavailable/not-configured state.
 */

/* ------------------------------------------------------------------ *
 * Platform & application identity
 * ------------------------------------------------------------------ */

export type PlatformFamily = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

/** How the UI is currently talking to native code. */
export type NativeBridgeKind = 'tauri' | 'unavailable';

export interface AppInfo {
  /** Product name, e.g. "ShieldForge Antivirus". */
  name: string;
  /** Semantic version of the application, from `tauri.conf.json`. */
  version: string;
  /** Human readable target, e.g. "Windows (x86_64) - desktop". */
  platform: PlatformFamily;
  platformDetail: string;
  arch: string;
  /** `desktop` when running inside Tauri, `web-preview` when opened in a browser. */
  buildTarget: 'desktop' | 'web-preview';
  nativeBridge: NativeBridgeKind;
  /** ISO-8601 timestamp of the running build, when the shell reports it. */
  buildTime: string | null;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type NativeErrorCode =
  | 'bridge_unavailable'
  | 'not_implemented'
  | 'not_configured'
  | 'permission_denied'
  | 'invalid_input'
  | 'not_found'
  | 'cancelled'
  | 'engine_error'
  | 'internal';

export interface NativeError {
  code: NativeErrorCode;
  /** Short, user-presentable message. Never contains secrets or full paths of system internals. */
  message: string;
  /** Optional actionable hint, e.g. "Run a full scan from Scan Center". */
  hint: string | null;
  /** Correlation id for the audit log / diagnostics export. */
  traceId: string | null;
}

/* ------------------------------------------------------------------ *
 * Protection components
 * ------------------------------------------------------------------ */

/**
 * Every state a security component can be in. Only `active` may be rendered as
 * a "protected" (green) state in the UI.
 */
export type ComponentState =
  | 'active'
  | 'degraded'
  | 'not_implemented'
  | 'not_configured'
  | 'permission_required'
  | 'unavailable'
  | 'error';

export type ComponentId =
  | 'on_demand_scanner'
  | 'signature_database'
  | 'real_time_monitor'
  | 'quarantine_service'
  | 'update_service'
  | 'audit_log';

export interface ProtectionComponent {
  id: ComponentId;
  label: string;
  /** One-line explanation of what the component does. */
  description: string;
  state: ComponentState;
  /** Precise reason for the current state. Never a placeholder. */
  detail: string;
  /** Populated only when `state === 'active'`. */
  version: string | null;
  platforms: PlatformFamily[];
  lastCheckedAt: string | null;
  remediation: string | null;
}

export interface ProtectionSnapshot {
  components: ProtectionComponent[];
  generatedAt: string;
  /** True only when *every* component reports `active`. Drives the hero badge. */
  fullyOperational: boolean;
  /** True when nothing is implemented yet - Phase 1 honest default. */
  engineConfigured: boolean;
}

/* ------------------------------------------------------------------ *
 * Scanner
 * ------------------------------------------------------------------ */

export type ScannerKind = 'none' | 'clamav' | 'fixture' | 'platform' | 'third_party';

export interface ScannerDescriptor {
  id: string;
  displayName: string;
  kind: ScannerKind;
  /**
   * `true` only after the adapter has performed a real self-check (binary
   * located, version probed, signature database readable).
   */
  available: boolean;
  engineVersion: string | null;
  signatureVersion: string | null;
  signatureCount: number | null;
  /** Why the scanner is unavailable, or `null` when available. */
  unavailableReason: string | null;
  /** ISO-8601 timestamp of the last successful self-check. */
  lastCheckedAt: string | null;
  capabilities: ScannerCapabilities;
}

export interface ScannerCapabilities {
  quickScan: boolean;
  fullScan: boolean;
  customPathScan: boolean;
  cancel: boolean;
  progressEvents: boolean;
  realTimeMonitoring: boolean;
}

/* ------------------------------------------------------------------ *
 * Scan jobs & results
 * ------------------------------------------------------------------ */

export type ScanProfile = 'quick' | 'full' | 'custom';

export type ScanJobStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'unavailable';

export interface ScanProgress {
  jobId: string;
  status: ScanJobStatus;
  profile: ScanProfile;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number;
  scannedFiles: number;
  /** `null` when the engine cannot know the total up-front. */
  totalFiles: number | null;
  detections: number;
  errors: number;
  unsupported: number;
  currentPath: string | null;
  message: string | null;
}

/** Verdict for a single scanned object. */
export type ScanVerdict = 'clean' | 'detected' | 'unsupported' | 'error' | 'skipped';

export type ThreatCategory =
  | 'malware'
  | 'pua'
  | 'suspicious'
  | 'test_fixture'
  | 'unclassified';

export interface Detection {
  /** Detection name as reported by the engine, e.g. "Win.Troponym.Fixture". */
  name: string;
  category: ThreatCategory;
  /** SHA-256 of the matched object, when the engine computes it. */
  sha256: string | null;
  sizeBytes: number | null;
  engine: string;
  engineVersion: string | null;
  signatureVersion: string | null;
}

export interface ScanFileResult {
  path: string;
  verdict: ScanVerdict;
  detection: Detection | null;
  /** Human readable explanation, especially for `error` / `unsupported`. */
  reason: string | null;
  scannedAt: string;
  durationMs: number | null;
}

export interface ScanSummary {
  jobId: string;
  profile: ScanProfile;
  status: ScanJobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number;
  scannedFiles: number;
  detections: number;
  errors: number;
  unsupported: number;
  /** Only populated when the engine supplied per-file results. */
  files: ScanFileResult[];
  error: NativeError | null;
}

/* ------------------------------------------------------------------ *
 * Quarantine
 * ------------------------------------------------------------------ */

export interface QuarantineItem {
  id: string;
  /** Original location before quarantine. */
  originalPath: string;
  /** Location inside the quarantine vault. Never directly user-writable. */
  vaultPath: string;
  quarantinedAt: string;
  detectionName: string;
  category: ThreatCategory;
  sizeBytes: number | null;
  sha256: string | null;
  engine: string;
  /** `false` when the original metadata was lost or the path is now invalid. */
  restorable: boolean;
}

export type QuarantineAction = 'quarantine' | 'restore' | 'delete' | 'restore_failed' | 'delete_failed';

/* ------------------------------------------------------------------ *
 * Updates
 * ------------------------------------------------------------------ */

export type UpdateState =
  | 'up_to_date'
  | 'update_available'
  | 'checking'
  | 'not_configured'
  | 'failed'
  | 'unavailable';

export interface UpdateStatus {
  state: UpdateState;
  engineVersion: string | null;
  installedSignatureVersion: string | null;
  installedSignatureReleasedAt: string | null;
  latestSignatureVersion: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  /** True only for authenticated, integrity-verified packages. */
  signaturesVerified: boolean;
  message: string;
  error: NativeError | null;
}

/* ------------------------------------------------------------------ *
 * History & audit
 * ------------------------------------------------------------------ */

export type HistoryKind =
  | 'scan_started'
  | 'scan_completed'
  | 'scan_failed'
  | 'scan_cancelled'
  | 'threat_detected'
  | 'quarantine'
  | 'restore'
  | 'delete'
  | 'restore_failed'
  | 'delete_failed'
  | 'update_check'
  | 'update_applied'
  | 'settings_changed'
  | 'ui_action';

export type Outcome = 'success' | 'failure' | 'cancelled' | 'info';

export interface HistoryEntry {
  id: string;
  at: string;
  kind: HistoryKind;
  title: string;
  detail: string;
  outcome: Outcome;
}

export interface AuditEvent extends HistoryEntry {
  actor: 'user' | 'system' | 'engine';
  /** Object the action applied to (path, component id, setting key). */
  target: string | null;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export type ThemePreference = 'dark' | 'light' | 'system';

export interface ScanPreferences {
  /** Archive/archive-internal scanning is engine-dependent. */
  scanArchives: boolean;
  maxFileSizeMb: number;
  followSymlinks: boolean;
  /** Hard stop for a single job, enforced by the native job manager. */
  maxDurationMinutes: number;
}

export interface PrivacyPreferences {
  /** Always false in Phase 1 - there is no telemetry backend. */
  shareThreatTelemetry: boolean;
  /** Always false in Phase 1 - there is no cloud scanning. */
  cloudLookup: boolean;
  keepHistoryDays: number;
}

export interface NotificationPreferences {
  scanCompleted: boolean;
  threatDetected: boolean;
  updateAvailable: boolean;
}

export interface Settings {
  theme: ThemePreference;
  scan: ScanPreferences;
  privacy: PrivacyPreferences;
  notifications: NotificationPreferences;
  /** Number of recent results kept in the in-memory result view. */
  resultsPageSize: number;
}
