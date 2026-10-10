import {
  Activity,
  Database,
  FolderSearch,
  PlayCircle,
  Radar,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/Card';
import { InfoRow, StatTile } from '@/components/common/StatTile';
import { ComponentCard } from '@/components/protection/ComponentCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatNumber, formatRelative, formatTimestamp } from '@/lib/format';
import { findLastScan } from '@/lib/history';
import type { PageId } from '@/lib/navigation';
import { overallTone, SCAN_STATUS_PRESENTATION, UPDATE_PRESENTATION } from '@/lib/statusTone';
import { useAppState } from '@/state/AppState';
import type { ProtectionSnapshot, ScanProfile } from '@/types/models';

export interface NavigateOptions {
  startScan?: ScanProfile;
}

export function OverviewPage({
  onNavigate,
}: {
  onNavigate: (page: PageId, options?: NavigateOptions) => void;
}): JSX.Element {
  const { appInfo, protection, scanner, updates, scan, summary, history, refreshProtection } =
    useAppState();

  const snapshot = protection.data;
  const lastScan = findLastScan(history);
  const hero = snapshot ? overallTone(snapshot) : null;
  const scannerAvailable = scanner.data?.available === true;
  const HeroIcon = hero?.tone === 'ok' ? ShieldCheck : hero?.tone === 'warn' ? ShieldAlert : ShieldX;

  return (
    <div className="space-y-6">
      {/* ---------------- Hero ---------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={
                hero?.tone === 'ok'
                  ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft text-accent'
                  : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-subtle'
              }
            >
              <HeroIcon className="h-6 w-6" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0">
              {protection.status === 'loading' && !snapshot ? (
                <>
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="mt-2 h-3 w-80" />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-ink">
                      {hero?.label ?? 'Protection status unavailable'}
                    </h2>
                    {hero ? <StatusBadge presentation={hero} /> : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
                    {hero?.description ??
                      'The native layer could not be reached, so no protection state can be shown.'}
                  </p>
                  <p className="mt-2 text-2xs text-ink-subtle">
                    {snapshot
                      ? `Reported ${formatTimestamp(snapshot.generatedAt)} · ${snapshot.components.filter((c) => c.state === 'active').length} of ${snapshot.components.length} components active`
                      : 'No snapshot received'}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="md"
              icon={<PlayCircle className="h-4 w-4" aria-hidden />}
              disabled={!scannerAvailable}
              title={scannerAvailable ? undefined : 'No scanner engine is configured'}
              onClick={() => onNavigate('scans', { startScan: 'quick' })}
            >
              Quick scan
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<ScanSearch className="h-4 w-4" aria-hidden />}
              onClick={() => onNavigate('scans')}
            >
              Scan Center
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon={<RefreshCw className="h-4 w-4" aria-hidden />}
              onClick={() => void refreshProtection()}
              loading={protection.status === 'loading'}
            >
              Re-check
            </Button>
          </div>
        </div>

        {protection.status === 'error' && protection.error ? (
          <div className="border-t border-line bg-surface-2/60 px-5 py-4">
            <Banner
              tone="neutral"
              title="Native protection services unavailable"
              action={
                <Button size="sm" variant="secondary" onClick={() => void refreshProtection()}>
                  Retry
                </Button>
              }
            >
              <p>{protection.error.message}</p>
              {protection.error.hint ? <p className="mt-1">{protection.error.hint}</p> : null}
              <p className="mt-2 opacity-80">
                Code: <span className="sf-mono">{protection.error.code}</span>
              </p>
            </Banner>
          </div>
        ) : null}
      </Card>

      {/* ---------------- Honest Phase 1 notice ---------------- */}
      {snapshot && !snapshot.engineConfigured ? (
        <Banner tone="warn" title="Detection engine not configured">
          ShieldForge Phase 1 ships the console, the native interfaces and the tests. It does{' '}
          <strong>not</strong> detect malware yet: no scanning engine is configured, so scans
          report “Scanner not configured” instead of results. Real-time monitoring is a separate,
          not-yet-started engineering project. Windows Defender and other platform security
          controls are left untouched.
        </Banner>
      ) : null}

      {/* ---------------- Stats ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Last scan"
          icon={ScanSearch}
          value={
            lastScan
              ? lastScan.kind === 'scan_started'
                ? 'In progress'
                : formatRelative(lastScan.at)
              : 'Never'
          }
          hint={
            lastScan
              ? `${lastScan.title} · ${formatTimestamp(lastScan.at)}`
              : 'No scan has been run in this installation yet.'
          }
          tone={lastScan?.outcome === 'failure' ? 'danger' : 'neutral'}
        />
        <StatTile
          label="Detections"
          icon={ShieldAlert}
          value={summary ? formatNumber(summary.detections) : '0'}
          tone={summary && summary.detections > 0 ? 'danger' : 'neutral'}
          hint={
            summary
              ? 'Detections reported by the scan engine for the most recent job.'
              : 'No scan has produced results yet. 0 means “nothing scanned”, not “nothing found”.'
          }
        />
        <StatTile
          label="Signature database"
          icon={Database}
          value={
            updates.data?.installedSignatureVersion ??
            scanner.data?.signatureVersion ??
            'Not configured'
          }
          tone={updates.data?.installedSignatureVersion ? 'ok' : 'neutral'}
          hint={
            updates.data
              ? `${UPDATE_PRESENTATION[updates.data.state].label} · last check ${formatRelative(updates.data.lastCheckedAt)}`
              : 'No signature database is present because no engine is configured.'
          }
        />
        <StatTile
          label="Real-time protection"
          icon={Radar}
          value={
            snapshot?.components.find((component) => component.id === 'real_time_monitor')?.state ===
            'active'
              ? 'Active'
              : 'Not implemented'
          }
          tone={
            snapshot?.components.find((component) => component.id === 'real_time_monitor')?.state ===
            'active'
              ? 'ok'
              : 'neutral'
          }
          hint="Continuous monitoring requires a native platform driver. Not started in Phase 1."
        />
      </div>

      {/* ---------------- Components ---------------- */}
      <section>
        <SectionHeading
          title="Protection components"
          description="Each card shows the state reported by the native component itself. Nothing here is assumed."
          actions={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('protection')}>
              Full status
            </Button>
          }
        />

        {protection.status === 'loading' && !snapshot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </Card>
            ))}
          </div>
        ) : snapshot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {snapshot.components.map((component) => (
              <ComponentCard key={component.id} component={component} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No component state available"
            description="ShieldForge could not reach the native security services, so it will not display a protection state."
            action={
              <Button size="sm" variant="secondary" onClick={() => void refreshProtection()}>
                Try again
              </Button>
            }
          />
        )}
      </section>

      {/* ---------------- Current scan + environment ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Current scan"
            description="State of the job running in this session, as reported by the native job manager."
            icon={<FolderSearch className="h-4 w-4" aria-hidden />}
            actions={<StatusBadge presentation={SCAN_STATUS_PRESENTATION[scan.status]} />}
          />
          <CardBody>
            {scan.status === 'idle' ? (
              <p className="text-xs leading-relaxed text-ink-muted">
                No scan is running. Start one from the Scan Center - when the engine is unavailable
                the job will stop immediately with “Scanner not configured” instead of pretending to
                scan.
              </p>
            ) : (
              <dl className="divide-y divide-line">
                <InfoRow label="Job" value={scan.jobId ?? '-'} mono />
                <InfoRow label="Profile" value={scan.profile ?? '-'} />
                <InfoRow
                  label="Scanned objects"
                  value={formatNumber(scan.progress?.scannedFiles ?? 0)}
                />
                <InfoRow label="Detections" value={formatNumber(scan.progress?.detections ?? 0)} />
                <InfoRow label="Errors" value={formatNumber(scan.progress?.errors ?? 0)} />
                <InfoRow
                  label="Current path"
                  value={scan.progress?.currentPath ?? '-'}
                  mono
                  title={scan.progress?.currentPath ?? undefined}
                />
                {scan.error ? <InfoRow label="Error" value={scan.error.message} /> : null}
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Environment" description="Reported by the running application." />
          <CardBody>
            <dl className="divide-y divide-line">
              <InfoRow label="Version" value={appInfo.data?.version ?? '-'} mono />
              <InfoRow label="Platform" value={appInfo.data?.platformDetail ?? '-'} />
              <InfoRow label="Architecture" value={appInfo.data?.arch ?? '-'} mono />
              <InfoRow label="Build target" value={appInfo.data?.buildTarget ?? '-'} />
              <InfoRow
                label="Native bridge"
                value={appInfo.data?.nativeBridge === 'tauri' ? 'Attached' : 'Not attached'}
              />
              <InfoRow label="Scanner" value={scanner.data?.displayName ?? 'Not configured'} />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export type { ProtectionSnapshot };
