import { cn } from '@/lib/cn';
import { COMPONENT_PRESENTATION, TONE_DOT } from '@/lib/statusTone';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatRelative } from '@/lib/format';
import type { ProtectionComponent } from '@/types/models';

/**
 * One protection component.
 *
 * Renders exactly what the native layer reported: no component is shown as
 * active unless its state is `active`.
 */
export function ComponentCard({
  component,
  compact = false,
}: {
  component: ProtectionComponent;
  compact?: boolean;
}): JSX.Element {
  const presentation = COMPONENT_PRESENTATION[component.state];

  return (
    <article
      className={cn(
        'sf-card sf-card-hover relative overflow-hidden p-4',
        'transition-colors duration-200 ease-smooth',
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-0 h-full w-[2px]',
          component.state === 'active' ? 'bg-accent' : TONE_DOT[presentation.tone],
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.8125rem] font-semibold text-ink">{component.label}</h3>
          {!compact ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{component.description}</p>
          ) : null}
        </div>
        <StatusBadge presentation={presentation} />
      </div>

      <p
        className={cn(
          'mt-3 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-xs leading-relaxed',
          component.state === 'active' ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {component.detail}
      </p>

      {component.remediation ? (
        <p className="mt-2 text-xs leading-relaxed text-warn">{component.remediation}</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 text-2xs text-ink-subtle">
        <span>{component.version ? `Version ${component.version}` : 'No version reported'}</span>
        <span title={component.lastCheckedAt ?? undefined}>
          Checked {formatRelative(component.lastCheckedAt)}
        </span>
      </div>
    </article>
  );
}
