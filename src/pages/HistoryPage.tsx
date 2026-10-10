import { useMemo, useState } from 'react';
import { Download, History as HistoryIcon, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { formatTimestamp, titleCase } from '@/lib/format';
import { filterHistory } from '@/lib/history';
import { OUTCOME_PRESENTATION } from '@/lib/statusTone';
import { useAppState } from '@/state/AppState';
import { MAX_AUDIT_ENTRIES } from '@/lib/constants';
import type { HistoryKind } from '@/types/models';

const KIND_OPTIONS: Array<{ id: HistoryKind | 'all'; label: string }> = [
  { id: 'all', label: 'All events' },
  { id: 'scan_started', label: 'Scan started' },
  { id: 'scan_completed', label: 'Scan completed' },
  { id: 'scan_failed', label: 'Scan failed' },
  { id: 'scan_cancelled', label: 'Scan cancelled' },
  { id: 'threat_detected', label: 'Threat detected' },
  { id: 'quarantine', label: 'Quarantine' },
  { id: 'restore', label: 'Restore' },
  { id: 'delete', label: 'Deletion' },
  { id: 'update_check', label: 'Update check' },
  { id: 'settings_changed', label: 'Settings' },
  { id: 'ui_action', label: 'UI action' },
];

const WINDOW_OPTIONS = [
  { id: 'all', label: 'All time', days: null },
  { id: '24h', label: 'Last 24 hours', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
] as const;

export function HistoryPage(): JSX.Element {
  const { history, audit, settings } = useAppState();
  const [kind, setKind] = useState<HistoryKind | 'all'>('all');
  const [timeWindow, setTimeWindow] = useState<(typeof WINDOW_OPTIONS)[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const minDateMs = useMemo(() => {
    const option = WINDOW_OPTIONS.find((item) => item.id === timeWindow);
    if (!option?.days) return null;
    return Date.now() - option.days * 24 * 60 * 60 * 1000;
  }, [timeWindow]);

  const entries = useMemo(
    () => filterHistory(history, { kind, query, minDateMs }),
    [history, kind, query, minDateMs],
  );

  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      application: 'ShieldForge Antivirus',
      retentionDays: settings.privacy.keepHistoryDays,
      entries: audit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `shieldforge-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    window.localStorage.removeItem('shieldforge.audit.v1');
    setConfirmClear(false);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Filters"
          description="Only events recorded by this installation are listed. Nothing is generated for display purposes."
          icon={<HistoryIcon className="h-4 w-4" aria-hidden />}
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={exportJson} icon={<Download className="h-3.5 w-3.5" aria-hidden />}>
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClear(true)}
                icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                disabled={history.length === 0}
              >
                Clear
              </Button>
            </div>
          }
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Search" htmlFor="history-search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <TextInput
                id="history-search"
                className="pl-9"
                placeholder="Title, detail, code…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Event type" htmlFor="history-kind">
            <Select
              id="history-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as HistoryKind | 'all')}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time window" htmlFor="history-window">
            <Select
              id="history-window"
              value={timeWindow}
              onChange={(event) =>
                setTimeWindow(event.target.value as (typeof WINDOW_OPTIONS)[number]['id'])
              }
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Events"
          description={`${entries.length} of ${history.length} recorded event${history.length === 1 ? '' : 's'} shown · retention ${settings.privacy.keepHistoryDays} days · cap ${MAX_AUDIT_ENTRIES}`}
        />
        <CardBody className="px-0 pb-0">
          {entries.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={HistoryIcon}
                title={history.length === 0 ? 'No history yet' : 'No events match these filters'}
                description={
                  history.length === 0
                    ? 'Scans, detections, quarantine actions, update checks and preference changes will appear here as they happen.'
                    : 'Try a different event type or time window.'
                }
              />
            </div>
          ) : (
            <ol className="divide-y divide-line">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-2/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-ink">{entry.title}</p>
                      <StatusBadge presentation={OUTCOME_PRESENTATION[entry.outcome]} showDot={false} />
                      <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs text-ink-subtle">
                        {titleCase(entry.kind)}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-xs leading-relaxed text-ink-muted">
                      {entry.detail}
                    </p>
                  </div>
                  <time
                    className="shrink-0 whitespace-nowrap text-2xs text-ink-subtle"
                    dateTime={entry.at}
                  >
                    {formatTimestamp(entry.at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        title="Clear local history?"
        confirmLabel="Clear history"
        onConfirm={clearHistory}
        onCancel={() => setConfirmClear(false)}
        description="This deletes the locally stored event log from this device. It cannot be undone. Engine-side audit records are unaffected."
      />
    </div>
  );
}
