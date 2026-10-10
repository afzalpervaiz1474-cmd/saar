/**
 * Local settings persistence.
 *
 * Phase 1 stores preferences in `localStorage` (browser) / the same keys inside
 * the webview. When the native shell is attached, settings are additionally
 * mirrored to the Rust side through the audit log; the UI never depends on a
 * network service to remember a preference.
 */

import { LIMITS } from './validation';
import { STORAGE_KEYS } from './constants';
import type { Settings } from '@/types/models';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  scan: {
    scanArchives: true,
    maxFileSizeMb: 512,
    followSymlinks: false,
    maxDurationMinutes: 120,
  },
  privacy: {
    // Phase 1 has no telemetry backend - these stay off and cannot send anything.
    shareThreatTelemetry: false,
    cloudLookup: false,
    keepHistoryDays: 30,
  },
  notifications: {
    scanCompleted: true,
    threatDetected: true,
    updateAvailable: true,
  },
  resultsPageSize: 25,
};

/**
 * Clamps a persisted numeric preference into its supported range.
 * Values below `min` become `min`, values above `max` become `max`, and
 * non-numbers fall back to the shipped default.
 */
function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Rebuilds a fully valid `Settings` object from arbitrary (persisted) JSON. */
export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const input = raw as Partial<Settings>;

  const theme: Settings['theme'] =
    input.theme === 'light' || input.theme === 'dark' || input.theme === 'system'
      ? input.theme
      : DEFAULT_SETTINGS.theme;

  const scan = (input.scan ?? {}) as Partial<Settings['scan']>;
  const privacy = (input.privacy ?? {}) as Partial<Settings['privacy']>;
  const notifications = (input.notifications ?? {}) as Partial<Settings['notifications']>;

  return {
    theme,
    scan: {
      scanArchives: bool(scan.scanArchives, DEFAULT_SETTINGS.scan.scanArchives),
      maxFileSizeMb: clamp(
        Number(scan.maxFileSizeMb),
        LIMITS.maxFileSizeMb.min,
        LIMITS.maxFileSizeMb.max,
        DEFAULT_SETTINGS.scan.maxFileSizeMb,
      ),
      followSymlinks: bool(scan.followSymlinks, DEFAULT_SETTINGS.scan.followSymlinks),
      maxDurationMinutes: clamp(
        Number(scan.maxDurationMinutes),
        LIMITS.maxDurationMinutes.min,
        LIMITS.maxDurationMinutes.max,
        DEFAULT_SETTINGS.scan.maxDurationMinutes,
      ),
    },
    privacy: {
      // Hard-locked false in Phase 1: there is no backend that could receive data.
      shareThreatTelemetry: false,
      cloudLookup: false,
      keepHistoryDays: clamp(
        Number(privacy.keepHistoryDays),
        LIMITS.keepHistoryDays.min,
        LIMITS.keepHistoryDays.max,
        DEFAULT_SETTINGS.privacy.keepHistoryDays,
      ),
    },
    notifications: {
      scanCompleted: bool(notifications.scanCompleted, DEFAULT_SETTINGS.notifications.scanCompleted),
      threatDetected: bool(notifications.threatDetected, DEFAULT_SETTINGS.notifications.threatDetected),
      updateAvailable: bool(notifications.updateAvailable, DEFAULT_SETTINGS.notifications.updateAvailable),
    },
    resultsPageSize: clamp(
      Number(input.resultsPageSize),
      LIMITS.resultsPageSize.min,
      LIMITS.resultsPageSize.max,
      DEFAULT_SETTINGS.resultsPageSize,
    ),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    // Corrupt or inaccessible storage must never break the app.
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    /* Storage may be disabled; preferences simply are not persisted. */
  }
}

export function resolveTheme(preference: Settings['theme']): 'dark' | 'light' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(preference: Settings['theme']): 'dark' | 'light' {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}
