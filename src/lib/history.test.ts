import { describe, expect, it } from 'vitest';
import { countByOutcome, filterHistory, findLastScan } from '@/lib/history';
import { auditEventFixture } from '@/test/fixtures';
import { toHistoryEntry } from '@/lib/audit';

const entries = [
  toHistoryEntry(auditEventFixture({ id: 'evt_1', kind: 'scan_started', at: '2026-10-10T08:00:00.000Z', outcome: 'info' })),
  toHistoryEntry(auditEventFixture({ id: 'evt_2', kind: 'scan_completed', at: '2026-10-10T09:00:00.000Z', outcome: 'success', title: 'Quick scan completed' })),
  toHistoryEntry(auditEventFixture({ id: 'evt_3', kind: 'settings_changed', at: '2026-10-10T10:00:00.000Z', outcome: 'success', detail: 'Updated: theme' })),
  toHistoryEntry(auditEventFixture({ id: 'evt_4', kind: 'scan_failed', at: '2026-10-09T10:00:00.000Z', outcome: 'failure', detail: 'Engine crashed' })),
];

describe('findLastScan', () => {
  it('returns the most recent scan-related entry', () => {
    expect(findLastScan(entries)?.id).toBe('evt_2');
  });

  it('returns null when no scan has ever run', () => {
    const noScans = entries.filter((entry) => entry.kind === 'settings_changed');
    expect(findLastScan(noScans)).toBeNull();
    expect(findLastScan([])).toBeNull();
  });
});

describe('filterHistory', () => {
  it('filters by kind', () => {
    const result = filterHistory(entries, { kind: 'settings_changed' });
    expect(result.map((entry) => entry.id)).toEqual(['evt_3']);
  });

  it('filters by free-text query across title, detail, kind and outcome', () => {
    expect(filterHistory(entries, { query: 'crashed' }).map((e) => e.id)).toEqual(['evt_4']);
    expect(filterHistory(entries, { query: 'theme' }).map((e) => e.id)).toEqual(['evt_3']);
    expect(filterHistory(entries, { query: 'zzz' })).toEqual([]);
  });

  it('filters by minimum timestamp', () => {
    const cutoff = Date.parse('2026-10-10T00:00:00.000Z');
    // Filtering preserves the incoming order; newest-first ordering is applied
    // by the audit store before entries reach the UI.
    expect(filterHistory(entries, { minDateMs: cutoff }).map((e) => e.id)).toEqual([
      'evt_1',
      'evt_2',
      'evt_3',
    ]);
  });

  it('returns everything when no filter is supplied', () => {
    expect(filterHistory(entries)).toHaveLength(entries.length);
  });
});

describe('countByOutcome', () => {
  it('counts each outcome', () => {
    expect(countByOutcome(entries)).toEqual({ info: 1, success: 2, failure: 1 });
  });
});
