import { AlertOctagon, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export type BannerTone = 'info' | 'warn' | 'danger' | 'neutral';

const STYLES: Record<BannerTone, { wrapper: string; icon: string; Icon: typeof Info }> = {
  info: {
    wrapper: 'border-line bg-surface-2 text-ink-muted',
    icon: 'text-ink-muted',
    Icon: Info,
  },
  warn: {
    wrapper: 'border-warn/40 bg-warn-soft text-warn',
    icon: 'text-warn',
    Icon: AlertTriangle,
  },
  danger: {
    wrapper: 'border-danger/40 bg-danger-soft text-danger',
    icon: 'text-danger',
    Icon: AlertOctagon,
  },
  neutral: {
    wrapper: 'border-line bg-surface-2 text-ink-subtle',
    icon: 'text-ink-subtle',
    Icon: ShieldAlert,
  },
};

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: BannerTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  const style = STYLES[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed',
        style.wrapper,
        className,
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <style.Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-semibold">{title}</p>
        {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
