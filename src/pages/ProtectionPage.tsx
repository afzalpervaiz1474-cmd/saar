import { useMemo, useState } from 'react';
import { Cpu, RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoRow } from '@/components/common/StatTile';
import { cn } from '@/lib/cn';
import { formatRelative, formatTimestamp } from '@/lib/format';
import { COMPONENT_PRESENTATION } from '@/lib/statusTone';
import { useAppState } from '@/state/AppState';
import { ComponentCard } from '@/components/protection/ComponentCard';
import type { ComponentState } from '@/types/models';

type Filter = 'all' | ComponentState;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'not_implemented', label: 'Not implemented' },
  { id: 'not_configured', label: 'Not configured' },
  { id: 'permission_required', label: 'Permission' },
  { id: 'unavailable', label: 'Unavailable' },
  { id: 'degraded', label: 'Degraded' },
  { id: 'error', label: 'Error' },
];

export function ProtectionPage(): JSX.Element {
  const { protection, refreshProtection } = useAppState();
  const [filter, setFilter] = useState<Filter>('all');

  const snapshot = protection.data;
  const components = useMemo(() => {
    if (!snapshot) return [];
    return filter === 'all'
      ? snapshot.components
      : snapshot.components.filter((component) => component.state === filter);
  }, [snapshot, filter]);

  const counts = useMemo(() => {
    const map = new Map<ComponentState, number>();
    for (const component of snapshot?.components ?? []) {
      map.set(component.state, (map.get(component.state) ?? 0) + 1);
    }
    return map;
  }, [snapshot]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Component status"
          description="Every row is produced by the component itself. A component is only shown as active after it confirms it is running."
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => void refreshProtection()}
              loading={protection.status === 'loading'}
            >
              Re-check
            </Button>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            <InfoRow
              label="Snapshot"
              value={snapshot ? formatTimestamp(snapshot.generatedAt) : '-'}
            />
            <InfoRow
              label="Active components"
              value={
                snapshot
                  ? `${snapshot.components.filter((c) => c.state === 'active').length} / ${snapshot.components.length}`
                  : '-'
              }
            />
            <InfoRow
              label="Engine configured"
              value={snapshot ? (snapshot.engineConfigured ? 'Yes' : 'No') : '-'}
            />
            <InfoRow
              label="Last refresh"
              value={protection.loadedAt ? formatRelative(protection.loadedAt) : 'never'}
            />
          </dl>
        </CardBody>
      </Card>

      {protection.status === 'error' && protection.error ? (
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
          <p className="mt-1">
            Nothing is reported as active while the native layer is unreachable.
          </p>
        </Banner>
      ) : null}

      <section>
        <SectionHeading
          title="Components"
          description="Filter by reported state. Counts come from the latest snapshot."
          actions={
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((option) => {
                const count =
                  option.id === 'all'
                    ? (snapshot?.components.length ?? 0)
                    : (counts.get(option.id) ?? 0);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    aria-pressed={filter === option.id}
                    className={cn(
                      'rounded-md border px-2 py-1 text-2xs font-medium transition-colors duration-150',
                      filter === option.id
                        ? 'border-accent/50 bg-accent-soft text-accent'
                        : 'border-line bg-surface-2 text-ink-subtle hover:text-ink',
                    )}
                  >
                    {option.label}
                    <span className="ml-1.5 opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          }
        />

        {protection.status === 'loading' && !snapshot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : components.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {components.map((component) => (
              <div key={component.id}>
                <ComponentCard component={component} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="text-2xs text-ink-subtle">
                    Platforms: {component.platforms.join(', ') || 'n/a'}
                  </span>
                  <StatusBadge presentation={COMPONENT_PRESENTATION[component.state]} showDot={false} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShieldQuestion}
            title="No components match this filter"
            description="Switch the filter to “All” to see every reported component."
          />
        )}
      </section>

      {/* ---------------- Real-time protection ---------------- */}
      <Card>
        <CardHeader
          title="Real-time protection"
          description="Continuous monitoring is a separate native project, not part of Phase 1."
          icon={<Cpu className="h-4 w-4" aria-hidden />}
          actions={
            <StatusBadge
              presentation={{
                tone: 'neutral',
                label: 'Not implemented',
                description: 'No native monitoring component exists yet.',
              }}
            />
          }
        />
        <CardBody className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <p>
            On-demand scanning and real-time monitoring are different engineering problems. A file
            scanner that inspects paths on request does <strong>not</strong> provide continuous
            protection, and ShieldForge does not claim otherwise.
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Windows:</strong> requires a kernel/driver-level filter (for example a
              minifilter) plus a signed, reviewed service. Not started.
            </li>
            <li>
              <strong>macOS:</strong> requires the Endpoint Security framework, Apple entitlements,
              notarisation and Full Disk Access. Not started.
            </li>
            <li>
              <strong>Android:</strong> device-wide scanning is not permitted by the platform; only
              app-scoped and user-initiated checks are possible. Not started.
            </li>
          </ul>
          <p className="text-warn">
            ShieldForge does not disable, bypass, or weaken Microsoft Defender or any other
            pre-installed platform security control.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
