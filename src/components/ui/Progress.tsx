import { cn } from '@/lib/cn';

/** Determinate or indeterminate progress bar. */
export function ProgressBar({
  value,
  className,
  label,
}: {
  /** 0-100, or `null` for indeterminate. */
  value: number | null;
  className?: string;
  label?: string;
}): JSX.Element {
  const indeterminate = value === null;
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-label={label ?? 'Progress'}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 animate-shimmer rounded-full bg-signal/80" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-smooth"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
