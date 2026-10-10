import { cn } from '@/lib/cn';

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  disabledReason,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  id?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-6 rounded-lg px-1 py-2.5',
        disabled && 'opacity-70',
      )}
    >
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn('block text-sm font-medium text-ink', disabled && 'cursor-not-allowed')}
        >
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p> : null}
        {disabled && disabledReason ? (
          <p className="mt-1 text-xs text-warn">{disabledReason}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-smooth',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'border-accent/60 bg-accent' : 'border-line-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-smooth',
            checked ? 'translate-x-[1.15rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
