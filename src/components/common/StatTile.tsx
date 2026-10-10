import { cn } from '@/lib/cn';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
  children?: ReactNode;
}): JSX.Element {
  const toneClass = {
    neutral: 'text-ink',
    ok: 'text-accent',
    warn: 'text-warn',
    danger: 'text-danger',
    info: 'text-ink-muted',
  }[tone];

  return (
    <div className="sf-card sf-card-hover flex flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="sf-label">{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
      </div>
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-subtle">{hint}</p> : null}
      {children}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono = false,
  title,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-ink-subtle">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right text-xs text-ink',
          mono && 'sf-mono text-[0.75rem]',
        )}
        title={title ?? (typeof value === 'string' ? value : undefined)}
      >
        {value}
      </dd>
    </div>
  );
}
