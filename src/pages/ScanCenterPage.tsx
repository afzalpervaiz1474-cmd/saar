import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Cpu,
  FileWarning,
  FolderPlus,
  FolderSearch,
  HardDrive,
  Loader2,
  Plus,
  ScanSearch,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/Card';
import { Field, TextInput } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ProgressBar } from '@/components/ui/Progress';
import { InfoRow } from '@/components/common/StatTile';
import { cn } from '@/lib/cn';
import { formatDuration, formatNumber, formatRelative, formatTimestamp } from '@/lib/format';
import { useNow } from '@/lib/hooks/useNow';
import {
  canCancel,
  canStart,
  elapsedMs,
  isBusy,
  isTerminal,
  progressPercent,
} from '@/lib/scanMachine';
import { SCAN_STATUS_PRESENTATION } from '@/lib/statusTone';
import { LIMITS, validateScanPath } from '@/lib/validation';
import { useAppState } from '@/state/AppState';
import type { ScanProfile } from '@/types/models';

interface ProfileOption {
  id: ScanProfile;
  title: string;
  description: string;
  icon: typeof ScanSearch;
  requiresPath: boolean;
}

const PROFILES: ProfileOption[] = [
  {
    id: 'quick',
    title: 'Quick scan',
    description: 'High-risk locations only (startup folders, user profile, temp). Fastest option.',
    icon: ScanSearch,
    requiresPath: false,
  },
  {
    id: 'full',
    title: 'Full scan',
    description: 'Every accessible fixed drive. Slowest option and the most disk I/O.',
    icon: HardDrive,
    requiresPath: false,
  },
  {
    id: 'custom',
    title: 'Custom location',
    description: 'Scan one or more folders you choose. Paths must be absolute.',
    icon: FolderSearch,
    requiresPath: true,
  },
];

export function ScanCenterPage({
  autoStartProfile,
  onAutoStartConsumed,
}: {
  autoStartProfile: ScanProfile | null;
  onAutoStartConsumed: () => void;
}): JSX.Element | null {
  const { scanner, scan, summary, settings, startScan, cancelScan, resetScan, refreshProtection } =
    useAppState();

  const [profile, setProfile] = useState<ScanProfile>('quick');
  const [pathInput, setPathInput] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [pathError, setPathError] = useState<string | null>(null);

  const descriptor = scanner.data;
  const scannerReady = descriptor?.available === true;
  const busy = isBusy(scan.status);
  const now = useNow(busy, 500);
  const elapsed = elapsedMs(scan, now);
  const percent = progressPercent(scan.progress);
  const startedRef = useRef<string | null>(null);

  /* Auto-start requested from the Overview (once per request). */
  useEffect(() => {
    if (!autoStartProfile) return;
    if (startedRef.current === `${autoStartProfile}:${targets.join('|')}`) return;
    startedRef.current = `${autoStartProfile}:${targets.join('|')}`;
    setProfile(autoStartProfile);
    if (scannerReady && !busy) {
      void startScan(autoStartProfile);
    }
    onAutoStartConsumed();
  }, [autoStartProfile, scannerReady, busy, startScan, onAutoStartConsumed, targets]);

  const addTarget = useCallback(() => {
    const result = validateScanPath(pathInput);
    if (!result.ok) {
      setPathError(result.message);
      return;
    }
    setPathError(null);
    const normalized = pathInput.trim();
    setTargets((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setPathInput('');
  }, [pathInput]);

  const removeTarget = useCallback((target: string) => {
    setTargets((prev) => prev.filter((item) => item !== target));
  }, []);

  const canRun = useMemo(() => {
    if (!scannerReady) return false;
    if (!canStart(scan)) return false;
    if (profile === 'custom' && targets.length === 0) return false;
    return true;
  }, [scannerReady, scan, profile, targets.length]);

  const disabledReason = !scannerReady
    ? 'Scanner not configured - no engine is available to run this scan.'
    : busy
      ? 'A scan is already running.'
      : profile === 'custom' && targets.length === 0
        ? 'Add at least one absolute folder path.'
        : null;

  const onStart = useCallback(() => {
    void startScan(profile, profile === 'custom' ? targets : undefined);
  }, [profile, targets, startScan]);

  const activeProfile = PROFILES.find((option) => option.id === profile) ?? PROFILES[0]!;

  return (
    <div className="space-y-6">
      {/* ---------------- Scanner status ---------------- */}
      <Card>
        <CardHeader
          title="Scanner engine"
          description="The engine that will be used for on-demand scans."
          icon={<Cpu className="h-4 w-4" aria-hidden />}
          actions={
            scanner.status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" aria-hidden />
            ) : (
              <StatusBadge
                presentation={
                  scannerReady
                    ? { tone: 'ok', label: 'Ready', description: 'Scanner self-check passed.' }
                    : {
                        tone: 'neutral',
                        label: 'Scanner not configured',
                        description: 'No usable scanning engine is registered.',
                      }
                }
              />
            )
          }
        />
        <CardBody className="space-y-4">
          {scanner.status === 'loading' && !descriptor ? (
            <div className="space-y-2">
              <div className="sf-skeleton h-3 w-1/3" />
              <div className="sf-skeleton h-3 w-1/2" />
            </div>
          ) : descriptor ? (
            <>
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <InfoRow label="Adapter" value={descriptor.displayName} />
                <InfoRow label="Engine version" value={descriptor.engineVersion ?? '-'} mono />
                <InfoRow label="Signature version" value={descriptor.signatureVersion ?? '-'} mono />
                <InfoRow
                  label="Signature count"
                  value={
                    descriptor.signatureCount === null
                      ? '-'
                      : formatNumber(descriptor.signatureCount)
                  }
                />
              </dl>

              {!descriptor.available ? (
                <Banner tone="warn" title="Scanner not configured">
                  <p>{descriptor.unavailableReason ?? 'No scanning engine is registered.'}</p>
                  <p className="mt-1">
                    Scan buttons stay disabled until an engine is configured. ShieldForge will never
                    simulate a scan or invent a detection.
                  </p>
                </Banner>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <CapabilityChip label="Quick scan" on={descriptor.capabilities.quickScan} />
                <CapabilityChip label="Full scan" on={descriptor.capabilities.fullScan} />
                <CapabilityChip label="Custom path" on={descriptor.capabilities.customPathScan} />
                <CapabilityChip label="Cancellation" on={descriptor.capabilities.cancel} />
                <CapabilityChip label="Progress events" on={descriptor.capabilities.progressEvents} />
                <CapabilityChip
                  label="Real-time monitoring"
                  on={descriptor.capabilities.realTimeMonitoring}
                />
              </div>
            </>
          ) : (
            <Banner
              tone="neutral"
              title="Scanner status unknown"
              action={
                <Button size="sm" variant="secondary" onClick={() => void refreshProtection()}>
                  Retry
                </Button>
              }
            >
              {scanner.error?.message ?? 'The scanner adapter could not be queried.'}
            </Banner>
          )}
        </CardBody>
      </Card>

      {/* ---------------- Profile selection ---------------- */}
      <section>
        <SectionHeading
          title="Scan profile"
          description="Choose what to scan. Limits from Settings apply to every profile."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROFILES.map((option) => {
            const Icon = option.icon;
            const selected = profile === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setProfile(option.id)}
                aria-pressed={selected}
                className={cn(
                  'sf-card sf-card-hover relative flex flex-col p-4 text-left transition-all duration-200 ease-smooth',
                  selected ? 'border-accent/60 ring-1 ring-accent/30' : '',
                  busy && 'opacity-70',
                )}
                disabled={busy}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg border',
                      selected
                        ? 'border-accent/40 bg-accent-soft text-accent'
                        : 'border-line bg-surface-2 text-ink-subtle',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-[0.8125rem] font-semibold text-ink">{option.title}</span>
                  {selected ? (
                    <CheckCircle2 className="ml-auto h-4 w-4 text-accent" aria-hidden />
                  ) : null}
                </div>
                <p className="mt-2.5 flex-1 text-xs leading-relaxed text-ink-muted">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- Custom targets ---------------- */}
      {activeProfile.requiresPath ? (
        <Card>
          <CardHeader
            title="Scan locations"
            description="Absolute paths only. Relative paths and “..” segments are rejected before they reach the native layer."
            icon={<FolderPlus className="h-4 w-4" aria-hidden />}
          />
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Field
                label="Folder path"
                className="flex-1"
                htmlFor="scan-path"
                error={pathError}
                hint="Example: C:\Users\ you\Documents or /home/you/Documents"
              >
                <TextInput
                  id="scan-path"
                  value={pathInput}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="C:\Users\ you\Documents"
                  onChange={(event) => {
                    setPathInput(event.target.value);
                    if (pathError) setPathError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTarget();
                    }
                  }}
                />
              </Field>
              <Button
                variant="secondary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
                onClick={addTarget}
                disabled={busy}
                className="mt-[1.6rem] sm:mt-[1.65rem]"
              >
                Add
              </Button>
            </div>

            {targets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-surface-2/50 px-3 py-4 text-center text-xs text-ink-subtle">
                No locations added yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {targets.map((target) => (
                  <li
                    key={target}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
                  >
                    <span className="sf-mono min-w-0 truncate text-ink" title={target}>
                      {target}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTarget(target)}
                      className="rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-3 hover:text-danger"
                      aria-label={`Remove ${target}`}
                      disabled={busy}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-2xs leading-relaxed text-ink-subtle">
              Limits in effect: max file size {settings.scan.maxFileSizeMb} MB, job timeout{' '}
              {settings.scan.maxDurationMinutes} min, archives{' '}
              {settings.scan.scanArchives ? 'included' : 'skipped'}, symlinks{' '}
              {settings.scan.followSymlinks ? 'followed' : 'not followed'}.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/* ---------------- Controls ---------------- */}
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              {activeProfile.title}
              {busy ? ' · running' : ''}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {disabledReason ?? 'Ready to start. The engine reports real progress and real results.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {busy ? (
              <Button
                variant="secondary"
                icon={<Ban className="h-4 w-4" aria-hidden />}
                onClick={() => void cancelScan()}
                disabled={!canCancel(scan)}
              >
                {scan.status === 'cancelling' ? 'Cancelling…' : 'Cancel scan'}
              </Button>
            ) : (
              <>
                {isTerminal(scan.status) ? (
                  <Button variant="ghost" onClick={resetScan}>
                    Clear
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ScanSearch className="h-4 w-4" aria-hidden />}
                  onClick={onStart}
                  disabled={!canRun}
                  title={disabledReason ?? undefined}
                >
                  Start scan
                </Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ---------------- Progress ---------------- */}
      {scan.status !== 'idle' ? (
        <Card>
          <CardHeader
            title="Scan progress"
            description="Live state from the native job manager."
            icon={<Clock className="h-4 w-4" aria-hidden />}
            actions={<StatusBadge presentation={SCAN_STATUS_PRESENTATION[scan.status]} />}
          />
          <CardBody className="space-y-4">
            <ProgressBar value={percent} label="Scan progress" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Elapsed" value={formatDuration(elapsed)} />
              <Metric label="Scanned" value={formatNumber(scan.progress?.scannedFiles ?? 0)} />
              <Metric
                label="Detections"
                value={formatNumber(scan.progress?.detections ?? 0)}
                tone={scan.progress && scan.progress.detections > 0 ? 'danger' : 'neutral'}
              />
              <Metric
                label="Errors"
                value={formatNumber(scan.progress?.errors ?? 0)}
                tone={scan.progress && scan.progress.errors > 0 ? 'warn' : 'neutral'}
              />
              <Metric label="Unsupported" value={formatNumber(scan.progress?.unsupported ?? 0)} />
              <Metric
                label="Total"
                value={
                  scan.progress?.totalFiles === null || scan.progress?.totalFiles === undefined
                    ? 'Unknown'
                    : formatNumber(scan.progress.totalFiles)
                }
              />
            </div>

            {scan.progress?.currentPath ? (
              <p className="sf-mono truncate rounded-lg bg-surface-2 px-3 py-2 text-ink-muted">
                {scan.progress.currentPath}
              </p>
            ) : null}

            {scan.error ? (
              <Banner
                tone={scan.error.code === 'not_configured' ? 'warn' : 'danger'}
                title={scan.error.message}
              >
                {scan.error.hint ? <p>{scan.error.hint}</p> : null}
                <p className="mt-1 opacity-80">
                  Code: <span className="sf-mono">{scan.error.code}</span>
                  {scan.error.traceId ? (
                    <>
                      {' · trace '}
                      <span className="sf-mono">{scan.error.traceId}</span>
                    </>
                  ) : null}
                </p>
              </Banner>
            ) : null}

            {summary && isTerminal(scan.status) ? (
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-xs text-ink-muted">
                <span className="font-semibold text-ink">Result set ready.</span> {summary.scannedFiles}{' '}
                objects scanned, {summary.detections} detection(s), {summary.errors} error(s). Open{' '}
                <span className="text-ink">Scan Results</span> for per-file verdicts.
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ---------------- Honest disclaimer ---------------- */}
      <Banner tone="info" title="What a scan result means">
        A “clean” verdict only means the configured engine found nothing with its current
        signatures. It is not a guarantee that a file is safe. Files the engine cannot read are
        reported as <strong>unsupported</strong> or <strong>error</strong> - never as clean.
        {scanner.data?.lastCheckedAt ? (
          <span className="mt-1 block opacity-80">
            Scanner last checked {formatRelative(scanner.data.lastCheckedAt)} (
            {formatTimestamp(scanner.data.lastCheckedAt)}).
          </span>
        ) : null}
      </Banner>

      {!scannerReady && scanner.status === 'error' ? (
        <Banner
          tone="neutral"
          title="Native scanner unreachable"
          action={
            <Button size="sm" variant="secondary" onClick={() => void refreshProtection()}>
              Retry
            </Button>
          }
        >
          {scanner.error?.message}
        </Banner>
      ) : null}

      <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        ShieldForge does not disable, bypass or weaken Microsoft Defender or any other platform
        security control. On-demand scanning runs alongside them.
      </p>

      <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
        <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Maximum path length accepted: {LIMITS.maxFileSizeMb.max} MB per file preference ceiling and{' '}
        {LIMITS.maxDurationMinutes.max} minutes job ceiling.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warn' | 'danger';
}): JSX.Element {
  const toneClass = {
    neutral: 'text-ink',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone];

  return (
    <div>
      <p className="sf-label">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

function CapabilityChip({ label, on }: { label: string; on: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-medium',
        on
          ? 'border-accent/40 bg-accent-soft text-accent'
          : 'border-line bg-surface-2 text-ink-subtle',
      )}
    >
      {on ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : (
        <XCircle className="h-3 w-3" aria-hidden />
      )}
      {label}
    </span>
  );
}
