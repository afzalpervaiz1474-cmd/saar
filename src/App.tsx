import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { ScanCenterPage } from '@/pages/ScanCenterPage';
import { ScanResultsPage } from '@/pages/ScanResultsPage';
import { QuarantinePage } from '@/pages/QuarantinePage';
import { ProtectionPage } from '@/pages/ProtectionPage';
import { UpdatesPage } from '@/pages/UpdatesPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage } from '@/pages/AboutPage';
import { AppStateProvider, useAppState } from '@/state/AppState';
import type { PageId } from '@/lib/navigation';
import type { ScanProfile } from '@/types/models';
import { isBusy } from '@/lib/scanMachine';

/**
 * Shell + routing.
 *
 * Phase 1 keeps routing local state: there are nine fixed pages and no deep
 * linking requirement yet, so adding a router dependency would be unnecessary
 * surface area. Navigation is real - every destination renders live state.
 */
export default function App(): JSX.Element {
  return (
    <AppStateProvider>
      <AppRoutes />
    </AppStateProvider>
  );
}

function AppRoutes(): JSX.Element {
  const [page, setPage] = useState<PageId>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  /** Profile requested from the Overview, consumed once by the Scan Center. */
  const [autoStart, setAutoStart] = useState<ScanProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    appInfo,
    protection,
    scan,
    summary,
    quarantine,
    settings,
    updateSettings,
    refreshProtection,
    refreshUpdates,
    refreshQuarantine,
  } = useAppState();

  const navigate = useCallback((next: PageId, options?: { startScan?: ScanProfile }) => {
    setPage(next);
    setMobileOpen(false);
    if (options?.startScan) setAutoStart(options.startScan);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshProtection(), refreshUpdates(), refreshQuarantine()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshProtection, refreshUpdates, refreshQuarantine]);

  // Keep the window title in sync with the active page.
  useEffect(() => {
    document.title = `ShieldForge Antivirus · ${pageTitles[page]}`;
  }, [page]);

  return (
    <AppShell
      page={page}
      onNavigate={navigate}
      onRefresh={onRefresh}
      refreshing={refreshing}
      mobileOpen={mobileOpen}
      onOpenMobileNav={() => setMobileOpen(true)}
      onCloseMobileNav={() => setMobileOpen(false)}
      appInfo={appInfo.data}
      protection={protection.data}
      settings={settings}
      onThemeChange={(theme) => updateSettings({ theme })}
      badges={{
        scans: isBusy(scan.status) ? 1 : null,
        results: summary ? summary.files.length : null,
        quarantine: quarantine.data ? quarantine.data.length : null,
      }}
    >
      {page === 'overview' ? <OverviewPage onNavigate={navigate} /> : null}
      {page === 'scans' ? (
        <ScanCenterPage autoStartProfile={autoStart} onAutoStartConsumed={() => setAutoStart(null)} />
      ) : null}
      {page === 'results' ? <ScanResultsPage onNavigate={navigate} /> : null}
      {page === 'quarantine' ? <QuarantinePage /> : null}
      {page === 'protection' ? <ProtectionPage /> : null}
      {page === 'updates' ? <UpdatesPage /> : null}
      {page === 'history' ? <HistoryPage /> : null}
      {page === 'settings' ? <SettingsPage /> : null}
      {page === 'about' ? <AboutPage /> : null}
    </AppShell>
  );
}

const pageTitles: Record<PageId, string> = {
  overview: 'Security Overview',
  scans: 'Scan Center',
  results: 'Scan Results',
  quarantine: 'Quarantine',
  protection: 'Protection Status',
  updates: 'Update Center',
  history: 'Security History',
  settings: 'Settings & Privacy',
  about: 'About & Diagnostics',
};
