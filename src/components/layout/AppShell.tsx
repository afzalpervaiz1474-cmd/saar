import type { ReactNode } from 'react';
import { Sidebar, type SidebarBadges } from './Sidebar';
import { TopBar } from './TopBar';
import type { PageId } from '@/lib/navigation';
import type { AppInfo, ProtectionSnapshot, Settings } from '@/types/models';

export function AppShell({
  page,
  onNavigate,
  onRefresh,
  refreshing,
  mobileOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  appInfo,
  protection,
  settings,
  onThemeChange,
  badges,
  children,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  onRefresh: () => void;
  refreshing: boolean;
  mobileOpen: boolean;
  onOpenMobileNav: () => void;
  onCloseMobileNav: () => void;
  appInfo: AppInfo | null;
  protection: ProtectionSnapshot | null;
  settings: Settings;
  onThemeChange: (theme: Settings['theme']) => void;
  badges: SidebarBadges;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="relative min-h-full">
      <Sidebar
        activePage={page}
        onNavigate={onNavigate}
        appInfo={appInfo}
        protection={protection}
        badges={badges}
        mobileOpen={mobileOpen}
        onCloseMobile={onCloseMobileNav}
      />

      <div className="flex min-h-full flex-col lg:pl-[16.5rem]">
        <TopBar
          page={page}
          onOpenMobileNav={onOpenMobileNav}
          onRefresh={onRefresh}
          refreshing={refreshing}
          settings={settings}
          onThemeChange={onThemeChange}
        />
        <main className="relative z-10 mx-auto w-full max-w-[92rem] flex-1 animate-fade-in px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
