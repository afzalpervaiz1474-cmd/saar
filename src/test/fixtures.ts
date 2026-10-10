/**
 * Test fixtures.
 *
 * These describe *engine output shapes* used by the automated tests. They are
 * only ever injected through a mocked native bridge; the application itself has
 * no code path that fabricates detections.
 */

import type {
  AppInfo,
  AuditEvent,
  ProtectionComponent,
  ProtectionSnapshot,
  QuarantineItem,
  ScanFileResult,
  ScanProgress,
  ScanSummary,
  ScannerDescriptor,
  UpdateStatus,
} from '@/types/models';

export const FIXTURE_NOW = '2026-10-10T09:00:00.000Z';

export function appInfoFixture(overrides: Partial<AppInfo> = {}): AppInfo {
  return {
    name: 'ShieldForge Antivirus',
    version: '0.1.0',
    platform: 'windows',
    platformDetail: 'Windows (x86_64) - desktop',
    arch: 'x86_64',
    buildTarget: 'desktop',
    nativeBridge: 'tauri',
    buildTime: FIXTURE_NOW,
    ...overrides,
  };
}

/** Descriptor for the harmless test-only fixture scanner (never shipped enabled). */
export function fixtureScanner(available = true): ScannerDescriptor {
  return {
    id: 'fixture-scanner',
    displayName: available ? 'ShieldForge Fixture Scanner (test only)' : 'No scanner registered',
    kind: available ? 'fixture' : 'none',
    available,
    engineVersion: available ? '0.0.1-test' : null,
    signatureVersion: available ? 'fixture-sig-1' : null,
    signatureCount: available ? 1 : null,
    unavailableReason: available ? null : 'No scanning engine is registered in this build.',
    lastCheckedAt: FIXTURE_NOW,
    capabilities: {
      quickScan: available,
      fullScan: available,
      customPathScan: available,
      cancel: available,
      progressEvents: available,
      // A file scanner is not a real-time monitor - always false.
      realTimeMonitoring: false,
    },
  };
}

export function componentFixture(
  overrides: Partial<ProtectionComponent> & { id: ProtectionComponent['id'] },
): ProtectionComponent {
  return {
    label: overrides.id,
    description: 'Fixture component.',
    state: 'not_implemented',
    detail: 'Not implemented in Phase 1.',
    version: null,
    platforms: ['windows'],
    lastCheckedAt: FIXTURE_NOW,
    remediation: null,
    ...overrides,
  };
}

export function protectionFixture(overrides: Partial<ProtectionSnapshot> = {}): ProtectionSnapshot {
  const components: ProtectionComponent[] = [
    componentFixture({
      id: 'on_demand_scanner',
      label: 'On-demand scanner',
      state: 'not_configured',
      detail: 'No scanning engine is registered.',
    }),
    componentFixture({
      id: 'signature_database',
      label: 'Signature database',
      state: 'not_configured',
      detail: 'No signature database is present.',
    }),
    componentFixture({
      id: 'real_time_monitor',
      label: 'Real-time monitoring',
      state: 'not_implemented',
      detail: 'No native monitoring component exists yet.',
    }),
    componentFixture({
      id: 'quarantine_service',
      label: 'Quarantine service',
      state: 'not_implemented',
      detail: 'Isolation requires a validated engine detection.',
    }),
    componentFixture({
      id: 'update_service',
      label: 'Update service',
      state: 'not_configured',
      detail: 'No verified update source is configured.',
    }),
    componentFixture({
      id: 'audit_log',
      label: 'Audit log',
      state: 'active',
      detail: 'Local audit log is recording events.',
      version: '0.1.0',
    }),
  ];

  return {
    components,
    generatedAt: FIXTURE_NOW,
    fullyOperational: false,
    engineConfigured: false,
    ...overrides,
  };
}

export function progressFixture(overrides: Partial<ScanProgress> = {}): ScanProgress {
  return {
    jobId: 'job_fixture1',
    status: 'completed',
    profile: 'quick',
    startedAt: FIXTURE_NOW,
    finishedAt: FIXTURE_NOW,
    elapsedMs: 1200,
    scannedFiles: 3,
    totalFiles: 3,
    detections: 1,
    errors: 1,
    unsupported: 1,
    currentPath: null,
    message: null,
    ...overrides,
  };
}

export function scanFileFixture(overrides: Partial<ScanFileResult> = {}): ScanFileResult {
  return {
    path: 'C:\\Users\\tester\\fixture\\clean.txt',
    verdict: 'clean',
    detection: null,
    reason: null,
    scannedAt: FIXTURE_NOW,
    durationMs: 3,
    ...overrides,
  };
}

export function summaryFixture(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    jobId: 'job_fixture1',
    profile: 'quick',
    status: 'completed',
    startedAt: FIXTURE_NOW,
    finishedAt: FIXTURE_NOW,
    elapsedMs: 1200,
    scannedFiles: 4,
    detections: 1,
    errors: 1,
    unsupported: 1,
    files: [
      scanFileFixture(),
      scanFileFixture({
        path: 'C:\\Users\\tester\\fixture\\shieldforge-fixture-marker.bin',
        verdict: 'detected',
        detection: {
          name: 'Fixture.TestMarker-1',
          category: 'test_fixture',
          sha256: 'a'.repeat(64),
          sizeBytes: 64,
          engine: 'fixture-scanner',
          engineVersion: '0.0.1-test',
          signatureVersion: 'fixture-sig-1',
        },
        reason: 'Fixture signature matched.',
      }),
      scanFileFixture({
        path: 'C:\\Users\\tester\\fixture\\locked.db',
        verdict: 'error',
        reason: 'Permission denied',
      }),
      scanFileFixture({
        path: 'C:\\Users\\tester\\fixture\\disk.img',
        verdict: 'unsupported',
        reason: 'Raw disk image not supported',
      }),
    ],
    error: null,
    ...overrides,
  };
}

export function quarantineItemFixture(overrides: Partial<QuarantineItem> = {}): QuarantineItem {
  return {
    id: 'qtn_fixture01',
    originalPath: 'C:\\Users\\tester\\fixture\\shieldforge-fixture-marker.bin',
    vaultPath: 'C:\\ProgramData\\ShieldForge\\vault\\qtn_fixture01.bin',
    quarantinedAt: FIXTURE_NOW,
    detectionName: 'Fixture.TestMarker-1',
    category: 'test_fixture',
    sizeBytes: 64,
    sha256: 'a'.repeat(64),
    engine: 'fixture-scanner',
    restorable: true,
    ...overrides,
  };
}

export function updateStatusFixture(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state: 'not_configured',
    engineVersion: '0.0.1-test',
    installedSignatureVersion: null,
    installedSignatureReleasedAt: null,
    latestSignatureVersion: null,
    lastCheckedAt: FIXTURE_NOW,
    lastSuccessAt: null,
    signaturesVerified: false,
    message: 'No verified update source is configured.',
    error: null,
    ...overrides,
  };
}

export function auditEventFixture(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'evt_fixture1',
    at: FIXTURE_NOW,
    kind: 'scan_started',
    title: 'Quick scan requested',
    detail: 'Scan request forwarded to the native scanner adapter.',
    outcome: 'info',
    actor: 'user',
    target: 'quick',
    ...overrides,
  };
}
