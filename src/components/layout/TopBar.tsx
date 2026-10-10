import { Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MobileMenuButton } from './Sidebar';
import { navItem, type PageId } from '@/lib/navigation';
import { Button } from '@/components/ui/Button';
import type { Settings } from '@/types/models';

export function TopBar({
  page,
  onOpenMobileNav,
  onRefresh,
  refreshing,
  settings,
  onThemeChange,
}: {
  page: PageId;
  onOpenMobileNav: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  settings: Settings;
  onThemeChange: (theme: Settings['theme']) => void;
}): JSX.Element {
  const item = navItem(page);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileMenuButton onClick={onOpenMobileNav} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.9375rem] font-semibold tracking-tight text-ink">
            {item.label}
          </h1>
          <p className="hidden truncate text-xs text-ink-subtle sm:block">{item.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitcher value={settings.theme} onChange={onThemeChange} />
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={refreshing}
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ThemeSwitcher({
  value,
  onChange,
}: {
  value: Settings['theme'];
  onChange: (theme: Settings['theme']) => void;
}): JSX.Element {
  const options: Array<{ id: Settings['theme']; label: string; icon: typeof Sun }> = [
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
              selected
                ? 'bg-surface-3 text-ink shadow-card'
                : 'text-ink-subtle hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
