import type { HistoryEntry, HistoryKind } from '@/types/models';

const SCAN_KINDS: ReadonlySet<HistoryKind> = new Set<HistoryKind>([
  'scan_started',
  'scan_completed',
  'scan_failed',
  'scan_cancelled',
  'threat_detected',
]);

/** Most recent scan-related entry, or `null` when no scan has been recorded. */
export function findLastScan(history: HistoryEntry[]): HistoryEntry | null {
  const scans = history
    .filter((entry) => SCAN_KINDS.has(entry.kind))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return scans[0] ?? null;
}

export function countByOutcome(history: HistoryEntry[]): Record<string, number> {
  return history.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.outcome] = (acc[entry.outcome] ?? 0) + 1;
    return acc;
  }, {});
}

/** Filters the history by kind and free-text query. */
export function filterHistory(
  history: HistoryEntry[],
  options: { kind?: HistoryKind | 'all'; query?: string; minDateMs?: number | null } = {},
): HistoryEntry[] {
  const query = (options.query ?? '').trim().toLowerCase();
  return history.filter((entry) => {
    if (options.kind && options.kind !== 'all' && entry.kind !== options.kind) return false;
    if (options.minDateMs && Date.parse(entry.at) < options.minDateMs) return false;
    if (query.length > 0) {
      const haystack = `${entry.title} ${entry.detail} ${entry.kind} ${entry.outcome}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
