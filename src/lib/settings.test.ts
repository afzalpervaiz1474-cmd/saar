import { describe, expect, it } from 'vitest';
import { LIMITS } from '@/lib/validation';
import {
  applyTheme,
  DEFAULT_SETTINGS,
  loadSettings,
  resolveTheme,
  sanitizeSettings,
  saveSettings,
} from '@/lib/settings';
import { STORAGE_KEYS } from '@/lib/constants';
import { createAuditEvent, createId, loadAudit, mergeAudit, saveAudit, toHistoryEntry } from '@/lib/audit';
import { auditEventFixture } from '@/test/fixtures';
import { MAX_AUDIT_ENTRIES } from '@/lib/constants';

describe('sanitizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range numbers into the supported limits', () => {
    const settings = sanitizeSettings({
      scan: { maxFileSizeMb: 999_999, maxDurationMinutes: -5 },
      resultsPageSize: 0,
      privacy: { keepHistoryDays: 10_000 },
    });
    expect(settings.scan.maxFileSizeMb).toBe(LIMITS.maxFileSizeMb.max);
    expect(settings.scan.maxDurationMinutes).toBe(LIMITS.maxDurationMinutes.min);
    expect(settings.resultsPageSize).toBe(LIMITS.resultsPageSize.min);
    expect(settings.privacy.keepHistoryDays).toBe(LIMITS.keepHistoryDays.max);
  });

  it('falls back to defaults for non-numeric values', () => {
    const settings = sanitizeSettings({
      scan: { maxFileSizeMb: Number.NaN, maxDurationMinutes: undefined },
      resultsPageSize: Number.POSITIVE_INFINITY,
    });
    expect(settings.scan.maxFileSizeMb).toBe(DEFAULT_SETTINGS.scan.maxFileSizeMb);
    expect(settings.scan.maxDurationMinutes).toBe(DEFAULT_SETTINGS.scan.maxDurationMinutes);
    expect(settings.resultsPageSize).toBe(DEFAULT_SETTINGS.resultsPageSize);
  });

  it('hard-locks telemetry and cloud lookup off (no backend exists)', () => {
    const settings = sanitizeSettings({
      privacy: { shareThreatTelemetry: true, cloudLookup: true },
    });
    expect(settings.privacy.shareThreatTelemetry).toBe(false);
    expect(settings.privacy.cloudLookup).toBe(false);
  });

  it('falls back to the default theme for unknown values', () => {
    expect(sanitizeSettings({ theme: 'neon' }).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(sanitizeSettings({ theme: 'light' }).theme).toBe('light');
  });

  it('keeps booleans that were supplied', () => {
    const settings = sanitizeSettings({ scan: { scanArchives: false, followSymlinks: true } });
    expect(settings.scan.scanArchives).toBe(false);
    expect(settings.scan.followSymlinks).toBe(true);
  });
});

describe('settings persistence', () => {
  it('round-trips through localStorage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(loadSettings().theme).toBe('light');
  });

  it('recovers from corrupted stored JSON', () => {
    window.localStorage.setItem(STORAGE_KEYS.settings, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('theme resolution', () => {
  it('resolves explicit preferences', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('writes the resolved theme to the document element', () => {
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('audit log', () => {
  it('creates events with unique ids', () => {
    const a = createAuditEvent({ kind: 'ui_action', title: 'a', detail: '', outcome: 'info' });
    const b = createAuditEvent({ kind: 'ui_action', title: 'b', detail: '', outcome: 'info' });
    expect(a.id).not.toBe(b.id);
    expect(createId('job')).toMatch(/^job_/);
  });

  it('merges newest-first and de-duplicates by id', () => {
    const older = auditEventFixture({ id: 'evt_1', at: '2026-10-10T08:00:00.000Z' });
    const newer = auditEventFixture({ id: 'evt_2', at: '2026-10-10T09:00:00.000Z' });
    const merged = mergeAudit([older], [newer, older]);
    expect(merged.map((event) => event.id)).toEqual(['evt_2', 'evt_1']);
  });

  it('bounds the log size', () => {
    const many = Array.from({ length: MAX_AUDIT_ENTRIES + 50 }, (_, index) =>
      auditEventFixture({ id: `evt_${index}`, at: new Date(index).toISOString() }),
    );
    expect(mergeAudit([], many)).toHaveLength(MAX_AUDIT_ENTRIES);
  });

  it('persists and reloads events, ignoring malformed records', () => {
    saveAudit([auditEventFixture()]);
    expect(loadAudit()).toHaveLength(1);

    window.localStorage.setItem(STORAGE_KEYS.audit, '[{ "id": 42 }, null, "x"]');
    expect(loadAudit()).toEqual([]);

    window.localStorage.setItem(STORAGE_KEYS.audit, 'not json');
    expect(loadAudit()).toEqual([]);
  });

  it('converts audit events into history entries without actor/target leakage', () => {
    const history = toHistoryEntry(auditEventFixture({ actor: 'system', target: 'secret' }));
    expect(history).not.toHaveProperty('actor');
    expect(history).not.toHaveProperty('target');
    expect(history.title).toBe('Quick scan requested');
  });
});
