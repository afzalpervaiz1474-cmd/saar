import { cn } from '@/lib/cn';
import { TONE_BG, TONE_DOT, type StatusPresentation } from '@/lib/statusTone';

/**
 * Status badge.
 *
 * Only the `ok` tone is allowed to look green, and `statusTone.ts` guarantees
 * that only confirmed-active components map to `ok`.
 */
export function StatusBadge({
  presentation,
  className,
  showDot = true,
}: {
  presentation: StatusPresentation;
  className?: string;
  showDot?: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-semibold',
        TONE_BG[presentation.tone],
        className,
      )}
      title={presentation.description}
    >
      {showDot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[presentation.tone])} aria-hidden />
      ) : null}
      {presentation.label}
    </span>
  );
}

export function StatusDot({ presentation }: { presentation: StatusPresentation }): JSX.Element {
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[presentation.tone])}
      title={`${presentation.label} - ${presentation.description}`}
      aria-hidden
    />
  );
}
