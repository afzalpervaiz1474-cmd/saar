import { Menu, Shield, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NAV_ITEMS, type PageId } from '@/lib/navigation';
import { PHASE } from '@/lib/constants';
import { StatusDot } from '@/components/ui/StatusBadge';
import { overallTone } from '@/lib/statusTone';
import type { AppInfo, ProtectionSnapshot } from '@/types/models';
import type { LucideIcon } from 'lucide-react';

export interface SidebarBadges {
  scans: number | null;
  results: number | null;
  quarantine: number | null;
}

export function Sidebar({
  activePage,
  onNavigate,
  appInfo,
  protection,
  badges,
  mobileOpen,
  onCloseMobile,
}: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  appInfo: AppInfo | null;
  protection: ProtectionSnapshot | null;
  badges: SidebarBadges;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}): JSX.Element {
  const hero = protection ? overallTone(protection) : null;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[16.5rem] flex-col border-r border-line bg-surface/80 backdrop-blur-sm',
          'transition-transform duration-300 ease-smooth lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Sidebar"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <Shield className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink">ShieldForge</p>
            <p className="truncate text-2xs text-ink-subtle">Antivirus · v{appInfo?.version ?? '-'}</p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="sf-divider" />

        {/* Navigation */}
        <nav className="sf-scroll flex-1 px-3 py-3" aria-label="Main navigation">
          <p className="sf-label px-2 pb-2">Console</p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <NavRow
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activePage === item.id}
                badge={badgeFor(item.id, badges)}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
              />
            ))}
          </ul>
        </nav>

        {/* Compact status area */}
        <div className="border-t border-line px-4 py-4">
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="sf-label">Protection</span>
              {hero ? <StatusDot presentation={hero} /> : <span className="h-2 w-2 rounded-full bg-ink-subtle/50" />}
            </div>
            <p className={cn('mt-1.5 text-xs font-semibold', hero ? toneText(hero.tone) : 'text-ink-subtle')}>
              {hero ? hero.label : 'Checking…'}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-subtle">
              {hero ? hero.description : 'Querying the native layer.'}
            </p>
          </div>

          <dl className="mt-3 space-y-1.5 text-2xs">
            <Row label="Platform" value={appInfo?.platformDetail ?? 'Detecting…'} />
            <Row label="Build" value={appInfo ? `${appInfo.buildTarget} · ${appInfo.arch}` : '-'} />
            <Row
              label="Native bridge"
              value={appInfo ? (appInfo.nativeBridge === 'tauri' ? 'Attached' : 'Not attached') : '-'}
            />
          </dl>

          <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">{PHASE}</p>
        </div>
      </aside>
    </>
  );
}

function NavRow({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge: number | null;
  onClick: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem]',
          'transition-colors duration-150 ease-smooth',
          active
            ? 'bg-surface-3 font-medium text-ink'
            : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-accent transition-opacity duration-150',
            active ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
        <Icon
          className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-ink-subtle')}
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge !== null && badge > 0 ? (
          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-2xs font-semibold text-ink-muted">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-subtle">{label}</dt>
      <dd className="truncate text-right text-ink-muted" title={value}>
        {value}
      </dd>
    </div>
  );
}

function badgeFor(id: PageId, badges: SidebarBadges): number | null {
  switch (id) {
    case 'scans':
      return badges.scans;
    case 'results':
      return badges.results;
    case 'quarantine':
      return badges.quarantine;
    default:
      return null;
  }
}

function toneText(tone: string): string {
  return {
    ok: 'text-accent',
    warn: 'text-warn',
    danger: 'text-danger',
    info: 'text-ink-muted',
    neutral: 'text-ink-subtle',
    loading: 'text-signal',
  }[tone] as string;
}

export function MobileMenuButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line bg-surface-2 p-2 text-ink-muted transition-colors hover:text-ink lg:hidden"
      aria-label="Open navigation"
    >
      <Menu className="h-4 w-4" aria-hidden />
    </button>
  );
}
