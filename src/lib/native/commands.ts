/**
 * Typed wrappers around every native command exposed by the Rust shell.
 *
 * This module is the *complete* list of privileged operations the frontend can
 * reach. Anything not listed here is not reachable from the webview
 * (see `src-tauri/capabilities/default.json`).
 *
 * Every wrapper:
 *  1. validates its inputs (defence in depth - Rust validates again),
 *  2. returns the engine's own data, and
 *  3. throws `NativeCommandError` instead of inventing a fallback value.
 */

import { bridge, NativeCommandError, toNativeError } from './bridge';
import { APP_NAME, APP_VERSION, COMMANDS } from '@/lib/constants';
import {
  validateJobId,
  validateQuarantineId,
  validateScanPath,
  validateScanProfile,
  type ValidationResult,
} from '@/lib/validation';
import type {
  AppInfo,
  AuditEvent,
  HistoryEntry,
  PlatformFamily,
  ProtectionSnapshot,
  QuarantineItem,
  ScanProfile,
  ScanProgress,
  ScanSummary,
  ScannerDescriptor,
  UpdateStatus,
} from '@/types/models';

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (bridge.kind !== 'tauri') {
    throw NativeCommandError.unavailable();
  }
  try {
    return await bridge.invoke<T>(command, args);
  } catch (error) {
    throw toNativeError(error);
  }
}

function assertValid(result: ValidationResult): void {
  if (!result.ok) {
    throw new NativeCommandError({
      code: 'invalid_input',
      message: result.message,
      hint: 'Correct the value and try again.',
      traceId: null,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Application / environment
 * ------------------------------------------------------------------ */

/**
 * Product and platform identity.
 *
 * When the native bridge is unavailable we still report *real* facts about the
 * runtime (browser, OS family, UI version) and explicitly mark the build target
 * as `web-preview`. We never mark a security component as active here.
 */
export async function getAppInfo(): Promise<AppInfo> {
  if (bridge.kind === 'tauri') {
    return call<AppInfo>(COMMANDS.appInfo);
  }

  return describeLocalRuntime();
}

function describeLocalRuntime(): AppInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? 'unknown';
  const platform = detectPlatformFamily(ua);
  const arch = detectArch(ua);

  return {
    name: APP_NAME,
    version: APP_VERSION,
    platform,
    platformDetail: `${platformLabel(platform)} - browser preview (native shell not attached)`,
    arch,
    buildTarget: 'web-preview',
    nativeBridge: 'unavailable',
    buildTime: null,
  };
}

export function detectPlatformFamily(ua: string): PlatformFamily {
  if (/Windows|Win32|Win64/i.test(ua)) return 'windows';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectArch(ua: string): string {
  if (/x86_64|x64|Win64|WOW64/i.test(ua)) return 'x86_64';
  if (/aarch64|arm64/i.test(ua)) return 'aarch64';
  if (/armv|Android/i.test(ua)) return 'arm';
  if (/i686|i386/i.test(ua)) return 'x86';
  return 'unknown';
}

function platformLabel(platform: PlatformFamily): string {
  switch (platform) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'android':
      return 'Android';
    case 'ios':
      return 'iOS';
    default:
      return 'Unknown platform';
  }
}

/* ------------------------------------------------------------------ *
 * Protection status
 * ------------------------------------------------------------------ */

export async function getProtectionStatus(): Promise<ProtectionSnapshot> {
  return call<ProtectionSnapshot>(COMMANDS.protectionStatus);
}

export async function getScannerDescriptor(): Promise<ScannerDescriptor> {
  return call<ScannerDescriptor>(COMMANDS.scannerDescriptor);
}

/* ------------------------------------------------------------------ *
 * Scanning
 * ------------------------------------------------------------------ */

export interface StartScanRequest {
  profile: ScanProfile;
  /** Required for `custom`, ignored for `quick` / `full`. */
  targets?: string[];
}

export async function startScan(request: StartScanRequest): Promise<ScanProgress> {
  assertValid(validateScanProfile(request.profile));

  const targets = request.targets ?? [];
  if (request.profile === 'custom') {
    if (targets.length === 0) {
      assertValid(validateScanPath(''));
    }
    for (const target of targets) {
      assertValid(validateScanPath(target));
    }
  }

  return call<ScanProgress>(COMMANDS.scanStart, { request: { profile: request.profile, targets } });
}

export async function getScanProgress(jobId: string): Promise<ScanProgress> {
  assertValid(validateJobId(jobId));
  return call<ScanProgress>(COMMANDS.scanProgress, { jobId });
}

export async function cancelScan(jobId: string): Promise<ScanProgress> {
  assertValid(validateJobId(jobId));
  return call<ScanProgress>(COMMANDS.scanCancel, { jobId });
}

export async function getScanResults(jobId: string): Promise<ScanSummary> {
  assertValid(validateJobId(jobId));
  return call<ScanSummary>(COMMANDS.scanResults, { jobId });
}

/* ------------------------------------------------------------------ *
 * Quarantine
 * ------------------------------------------------------------------ */

export async function listQuarantine(): Promise<QuarantineItem[]> {
  return call<QuarantineItem[]>(COMMANDS.quarantineList);
}

export async function restoreQuarantineItem(id: string): Promise<QuarantineItem[]> {
  assertValid(validateQuarantineId(id));
  return call<QuarantineItem[]>(COMMANDS.quarantineRestore, { id });
}

export async function deleteQuarantineItem(id: string): Promise<QuarantineItem[]> {
  assertValid(validateQuarantineId(id));
  return call<QuarantineItem[]>(COMMANDS.quarantineDelete, { id });
}

/* ------------------------------------------------------------------ *
 * Updates
 * ------------------------------------------------------------------ */

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return call<UpdateStatus>(COMMANDS.updateStatus);
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  return call<UpdateStatus>(COMMANDS.updateCheck);
}

/* ------------------------------------------------------------------ *
 * History / audit
 * ------------------------------------------------------------------ */

export async function getHistory(): Promise<HistoryEntry[]> {
  return call<HistoryEntry[]>(COMMANDS.historyList);
}

export async function getAuditLog(): Promise<AuditEvent[]> {
  return call<AuditEvent[]>(COMMANDS.auditList);
}
