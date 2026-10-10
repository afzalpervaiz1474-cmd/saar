import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="sf-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-subtle ' +
  'transition-colors duration-150 hover:border-line-strong focus:border-accent/60 focus:outline-none ' +
  'focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60';

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={cn(inputClass, className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <div className="relative">
      <select
        className={cn(inputClass, 'appearance-none pr-9', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
}
