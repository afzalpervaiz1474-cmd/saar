import { cn } from '@/lib/cn';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'warn' | 'info' | 'danger';
  className?: string;
}): JSX.Element {
  const toneRing = {
    neutral: 'border-line bg-surface-2 text-ink-subtle',
    warn: 'border-warn/40 bg-warn-soft text-warn',
    info: 'border-line bg-surface-2 text-ink-muted',
    danger: 'border-danger/40 bg-danger-soft text-danger',
  }[tone];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-2/40 px-6 py-10 text-center',
        className,
      )}
    >
      <span className={cn('mb-3 flex h-11 w-11 items-center justify-center rounded-xl border', toneRing)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
