import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileWarning,
  ListFilter,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoRow } from '@/components/common/StatTile';
import { cn } from '@/lib/cn';
import { formatDuration, formatNumber, formatTimestamp, titleCase, truncateMiddle } from '@/lib/format';
import type { PageId } from '@/lib/navigation';
import { SCAN_STATUS_PRESENTATION, VERDICT_PRESENTATION } from '@/lib/statusTone';
import { useAppState } from '@/state/AppState';
import type { ScanFileResult, ScanVerdict } from '@/types/models';

type Filter = 'all' | 'detected' | 'clean' | 'problems';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'detected', label: 'Detected' },
  { id: 'clean', label: 'Clean' },
  { id: 'problems', label: 'Errors & unsupported' },
];

export function ScanResultsPage({ onNavigate }: { onNavigate: (page: PageId) => void }): JSX.Element {
  const { summary, scan, settings } = useAppState();
  const [filter, setFilter] = useState<Filter>('all');

  const files = useMemo(() => {
    const all = summary?.files ?? [];
    const filtered = all.filter((file) => matchesFilter(file, filter));
    return filtered.slice(0, settings.resultsPageSize);
  }, [summary, filter, settings.resultsPageSize]);

  const counts = useMemo(() => {
    const all = summary?.files ?? [];
    return {
      all: all.length,
      detected: all.filter((file) => file.verdict === 'detected').length,
      clean: all.filter((file) => file.verdict === 'clean').length,
      problems: all.filter((file) => file.verdict === 'error' || file.verdict === 'unsupported')
        .length,
    };
  }, [summary]);

  if (!summary) {
    return (
      <div className="space-y-4">
        <Banner tone="info" title="No scan results yet">
          Results appear here after a scan engine completes a job. ShieldForge does not prefill this
          page with example detections.
        </Banner>
        <EmptyState
          icon={FileSearch}
          title="No results to display"
          description={
            scan.status === 'unavailable' || scan.error?.code === 'not_configured'
              ? 'The last scan could not run because no scanning engine is configured.'
              : 'Run a scan from the Scan Center. Every row below will come from the engine output.'
          }
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<ScanSearch className="h-4 w-4" aria-hidden />}
              onClick={() => onNavigate('scans')}
            >
              Go to Scan Center
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Scan summary"
          description="Aggregated counters reported by the engine for this job."
          icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          actions={<StatusBadge presentation={SCAN_STATUS_PRESENTATION[summary.status]} />}
        />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Job" value={summary.jobId} mono />
            <InfoRow label="Profile" value={titleCase(summary.profile)} />
            <InfoRow label="Started" value={formatTimestamp(summary.startedAt)} />
            <InfoRow label="Finished" value={formatTimestamp(summary.finishedAt)} />
            <InfoRow label="Duration" value={formatDuration(summary.elapsedMs)} />
            <InfoRow label="Objects scanned" value={formatNumber(summary.scannedFiles)} />
            <InfoRow
              label="Detections"
              value={formatNumber(summary.detections)}
            />
            <InfoRow label="Errors" value={formatNumber(summary.errors)} />
            <InfoRow label="Unsupported" value={formatNumber(summary.unsupported)} />
          </dl>
          {summary.error ? (
            <div className="mt-4">
              <Banner tone="danger" title={summary.error.message}>
                {summary.error.hint}
              </Banner>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Per-object results"
          description="One row per object the engine reported. Verdicts are shown exactly as supplied."
          icon={<ListFilter className="h-4 w-4" aria-hidden />}
          actions={
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  aria-pressed={filter === option.id}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors duration-150',
                    filter === option.id
                      ? 'bg-surface-3 text-ink'
                      : 'text-ink-subtle hover:text-ink',
                  )}
                >
                  {option.label}
                  <span className="ml-1.5 text-ink-subtle">{counts[option.id]}</span>
                </button>
              ))}
            </div>
          }
        />
        <CardBody className="px-0 pb-0">
          {files.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={summary.files.length === 0 ? FileWarning : CheckCircle2}
                title={
                  summary.files.length === 0
                    ? 'Engine returned no per-object records'
                    : 'No rows match this filter'
                }
                description={
                  summary.files.length === 0
                    ? 'The scan finished but the engine did not return individual file records. Aggregate counters above are the only available evidence.'
                    : 'Change the filter to see the other verdicts.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-y border-line bg-surface-2/60">
                    <Th>Path</Th>
                    <Th>Verdict</Th>
                    <Th>Detection</Th>
                    <Th>Category</Th>
                    <Th>Scanned</Th>
                    <Th className="text-right">Detail</Th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file, index) => (
                    <ResultRow key={`${file.path}:${index}`} file={file} />
                  ))}
                </tbody>
              </table>
              {summary.files.length > files.length ? (
                <p className="px-5 py-3 text-2xs text-ink-subtle">
                  Showing {files.length} of {summary.files.length} records (page size{' '}
                  {settings.resultsPageSize}, configurable in Settings).
                </p>
              ) : (
                <p className="px-5 py-3 text-2xs text-ink-subtle">
                  {files.length} record{files.length === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Banner tone="info" title="Interpretation">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Clean</strong> means the engine found nothing with its current signatures - it is
            not a safety guarantee.
          </li>
          <li>
            <strong>Unsupported</strong> and <strong>Error</strong> mean the object was not
            successfully inspected; they are never counted as clean.
          </li>
          <li>
            <strong>Detected</strong> rows can only be quarantined after the detection has been
            validated by the quarantine service.
          </li>
        </ul>
      </Banner>
    </div>
  );
}

function ResultRow({ file }: { file: ScanFileResult }): JSX.Element {
  const presentation = VERDICT_PRESENTATION[file.verdict];
  return (
    <tr className="border-b border-line/70 transition-colors hover:bg-surface-2/50">
      <Td>
        <span className="sf-mono block max-w-[26rem] truncate text-ink" title={file.path}>
          {truncateMiddle(file.path, 72)}
        </span>
      </Td>
      <Td>
        <StatusBadge presentation={presentation} />
      </Td>
      <Td>
        <span className={file.detection ? 'text-ink' : 'text-ink-subtle'}>
          {file.detection?.name ?? '-'}
        </span>
      </Td>
      <Td>
        <span className="text-ink-muted">
          {file.detection ? titleCase(file.detection.category) : '-'}
        </span>
      </Td>
      <Td>
        <span className="text-ink-muted">{formatTimestamp(file.scannedAt)}</span>
      </Td>
      <Td className="text-right">
        <span
          className="text-xs text-ink-subtle"
          title={file.reason ?? undefined}
        >
          {file.verdict === 'error' ? (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {truncateMiddle(file.reason ?? 'Error', 28)}
            </span>
          ) : file.reason ? (
            truncateMiddle(file.reason, 28)
          ) : (
            '-'
          )}
        </span>
      </Td>
    </tr>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <th
      scope="col"
      className={cn('px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle', className)}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return <td className={cn('px-4 py-2.5 align-middle text-xs', className)}>{children}</td>;
}

function matchesFilter(file: ScanFileResult, filter: Filter): boolean {
  switch (filter) {
    case 'detected':
      return file.verdict === 'detected';
    case 'clean':
      return file.verdict === 'clean';
    case 'problems':
      return file.verdict === 'error' || file.verdict === 'unsupported';
    default:
      return true;
  }
}

export type { ScanVerdict };
