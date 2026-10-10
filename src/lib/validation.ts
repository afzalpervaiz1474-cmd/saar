/**
 * Input validation shared by the frontend and mirrored (authoritatively) in
 * `shieldforge_core::validation`.
 *
 * The frontend copy exists to give the user immediate, safe feedback and to keep
 * obviously malformed values out of IPC. It is NOT a security boundary: every
 * value is re-validated in Rust before it touches the filesystem.
 */

import type { ScanProfile } from '@/types/models';

export interface ValidationResult {
  ok: boolean;
  /** Stable machine-readable code, mirrored in Rust. */
  code:
    | 'ok'
    | 'empty'
    | 'too_long'
    | 'null_byte'
    | 'traversal'
    | 'invalid_root'
    | 'invalid_profile'
    | 'invalid_id'
    | 'out_of_range';
  message: string;
}

const OK: ValidationResult = { ok: true, code: 'ok', message: '' };

/** Characters that are illegal in Windows paths and useless elsewhere. */
const ILLEGAL_CHARS = /[<>:"|?*\u0000-\u001F]/;

/** Maximum path length accepted from the UI (Windows MAX_PATH territory). */
export const MAX_PATH_LENGTH = 32_767;

export function validateScanPath(raw: string): ValidationResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, code: 'empty', message: 'Enter a folder path to scan.' };
  }

  const path = raw.trim();

  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, code: 'too_long', message: `Path exceeds ${MAX_PATH_LENGTH} characters.` };
  }

  if (path.includes('\u0000')) {
    // NUL terminates C strings and is a classic truncation/validation bypass.
    return { ok: false, code: 'null_byte', message: 'Path contains a null byte.' };
  }

  if (path.includes('..')) {
    // Path traversal is rejected outright: custom scans must be rooted at a
    // concrete directory, never relative.
    return {
      ok: false,
      code: 'traversal',
      message: 'Relative segments ("..") are not allowed. Use an absolute path.',
    };
  }

  const isWindowsAbsolute = /^[A-Za-z]:[\\/]/.test(path);
  const isUnixAbsolute = path.startsWith('/');
  if (!isWindowsAbsolute && !isUnixAbsolute) {
    return {
      ok: false,
      code: 'invalid_root',
      message: 'Use an absolute path, for example C:\\Users\\you or /home/you.',
    };
  }

  // The drive colon ("C:\") is legal; every other occurrence of the illegal
  // character set is not, so the prefix is stripped before the check.
  const remainder = isWindowsAbsolute ? path.slice(2) : path;
  if (ILLEGAL_CHARS.test(remainder)) {
    return {
      ok: false,
      code: 'invalid_root',
      message: 'Path contains characters that are not valid in a filesystem path.',
    };
  }

  return OK;
}

export function validateScanProfile(raw: unknown): ValidationResult {
  const valid: ScanProfile[] = ['quick', 'full', 'custom'];
  if (typeof raw === 'string' && (valid as string[]).includes(raw)) return OK;
  return { ok: false, code: 'invalid_profile', message: 'Unsupported scan profile.' };
}

/** Quarantine ids are opaque, engine-generated tokens: `qtn_<base32>`. */
export function validateQuarantineId(raw: string): ValidationResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, code: 'empty', message: 'Missing quarantine item id.' };
  }
  if (raw.length > 128) {
    return { ok: false, code: 'too_long', message: 'Quarantine id is too long.' };
  }
  if (!/^qtn_[A-Za-z0-9_-]{4,}$/.test(raw)) {
    return { ok: false, code: 'invalid_id', message: 'Malformed quarantine id.' };
  }
  return OK;
}

export function validateJobId(raw: string): ValidationResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, code: 'empty', message: 'Missing scan job id.' };
  }
  if (!/^job_[A-Za-z0-9_-]{4,64}$/.test(raw)) {
    return { ok: false, code: 'invalid_id', message: 'Malformed scan job id.' };
  }
  return OK;
}

/** Numeric preference guard rails (mirrored in Rust). */
export function validateRange(value: number, min: number, max: number): ValidationResult {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return { ok: false, code: 'out_of_range', message: 'Value must be a number.' };
  }
  if (value < min || value > max) {
    return {
      ok: false,
      code: 'out_of_range',
      message: `Value must be between ${min} and ${max}.`,
    };
  }
  return OK;
}

export const LIMITS = {
  maxFileSizeMb: { min: 1, max: 4096 },
  maxDurationMinutes: { min: 1, max: 720 },
  keepHistoryDays: { min: 1, max: 365 },
  resultsPageSize: { min: 5, max: 200 },
} as const;
