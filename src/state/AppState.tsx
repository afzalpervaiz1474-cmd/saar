/**
 * Application state container.
 *
 * Everything the UI renders comes from here, and everything here comes from
 * either (a) the native Rust layer via `lib/native/commands`, or (b) local
 * preferences / audit records. There is no mock data source and no random
 * generator: if the native layer does not answer, the resource ends up in the
 * `error` state and the UI renders an explicit unavailable state.
 */

import {
  createAuditEvent,
  loadAudit,
  mergeAudit,
  saveAudit,
  toHistoryEntry,
} from '@/lib/audit';
import { NativeCommandError, toNativeError } from '@/lib/native/bridge';
import * as commands from '@/lib/native/commands';
import {
  canCancel as canCancelScan,
  elapsedMs,
  initialScanState,
  isBusy,
  isTerminal,
  scanReducer,
  type ScanUiState,
} from '@/lib/scanMachine';
import { applyTheme, loadSettings, resolveTheme, saveSettings } from '@/lib/settings';
import type {
  AppInfo,
  AuditEvent,
  HistoryEntry,
  NativeError,
  ProtectionSnapshot,
  QuarantineItem,
  ScanProfile,
  ScanSummary,
  ScannerDescriptor,
  Settings,
  UpdateStatus,
} from '@/types/models';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  errorResource,
  idleResource,
  loadingResource,
  readyResource,
  type AsyncResource,
} from './async';

export interface AppStateValue {
  appInfo: AsyncResource<AppInfo>;
  protection: AsyncResource<ProtectionSnapshot>;
  scanner: AsyncResource<ScannerDescriptor>;
  updates: AsyncResource<UpdateStatus>;
  quarantine: AsyncResource<QuarantineItem[]>;
  scan: ScanUiState;
  summary: ScanSummary | null;
  audit: AuditEvent[];
  history: HistoryEntry[];
  settings: Settings;
  theme: 'dark' | 'light';

  refreshProtection: () => Promise<void>;
  refreshUpdates: () => Promise<void>;
  refreshQuarantine: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  startScan: (profile: ScanProfile, targets?: string[]) => Promise<void>;
  cancelScan: () => Promise<void>;
  resetScan: () => void;
  restoreQuarantineItem: (id: string) => Promise<void>;
  deleteQuarantineItem: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  recordAudit: (event: Omit<Parameters<typeof createAuditEvent>[0], 'at'>) => void;
  elapsedMs: number;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** Interval for polling scan progress while a job is in flight. */
const PROGRESS_POLL_MS = 750;

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [appInfo, setAppInfo] = useState<AsyncResource<AppInfo>>(idleResource<AppInfo>);
  const [protection, setProtection] = useState<AsyncResource<ProtectionSnapshot>>(
    idleResource<ProtectionSnapshot>,
  );
  const [scanner, setScanner] = useState<AsyncResource<ScannerDescriptor>>(
    idleResource<ScannerDescriptor>,
  );
  const [updates, setUpdates] = useState<AsyncResource<UpdateStatus>>(idleResource<UpdateStatus>);
  const [quarantine, setQuarantine] = useState<AsyncResource<QuarantineItem[]>>(
    idleResource<QuarantineItem[]>,
  );
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [scan, dispatchScan] = useReducer(scanReducer, initialScanState);
  const [audit, setAudit] = useState<AuditEvent[]>(() => loadAudit());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => applyTheme(loadSettings().theme));
  const [tick, setTick] = useState(() => Date.now());

  const auditRef = useRef(audit);
  auditRef.current = audit;

  const recordAudit = useCallback(
    (event: Omit<Parameters<typeof createAuditEvent>[0], 'at'>) => {
      const next = mergeAudit(auditRef.current, [createAuditEvent(event)]);
      auditRef.current = next;
      setAudit(next);
      saveAudit(next);
    },
    [],
  );

  /* ---------------- theme ---------------- */

  useEffect(() => {
    setTheme(applyTheme(settings.theme));
  }, [settings.theme]);

  useEffect(() => {
    if (settings.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setTheme(resolveTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme]);

  /* ---------------- initial load ---------------- */

  useEffect(() => {
    let cancelled = false;

    // App identity never fails: in a browser it reports the honest
    // "web-preview" build target.
    setAppInfo(loadingResource<AppInfo>(null));
    commands
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(readyResource(info));
      })
      .catch((error: unknown) => {
        if (!cancelled) setAppInfo(errorResource<AppInfo>(toNativeError(error)));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProtection = useCallback(async () => {
    setProtection((prev) => loadingResource(prev));
    setScanner((prev) => loadingResource(prev));
    try {
      const snapshot = await commands.getProtectionStatus();
      setProtection(readyResource(snapshot));
    } catch (error) {
      setProtection((prev) => errorResource<ProtectionSnapshot>(toNativeError(error), prev));
    }
    try {
      const descriptor = await commands.getScannerDescriptor();
      setScanner(readyResource(descriptor));
    } catch (error) {
      setScanner((prev) => errorResource<ScannerDescriptor>(toNativeError(error), prev));
    }
  }, []);

  const refreshUpdates = useCallback(async () => {
    setUpdates((prev) => loadingResource(prev));
    try {
      setUpdates(readyResource(await commands.getUpdateStatus()));
    } catch (error) {
      setUpdates((prev) => errorResource<UpdateStatus>(toNativeError(error), prev));
    }
  }, []);

  const refreshQuarantine = useCallback(async () => {
    setQuarantine((prev) => loadingResource(prev));
    try {
      setQuarantine(readyResource(await commands.listQuarantine()));
    } catch (error) {
      setQuarantine((prev) => errorResource<QuarantineItem[]>(toNativeError(error), prev));
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    setUpdates((prev) => loadingResource(prev));
    recordAudit({
      kind: 'update_check',
      title: 'Update check requested',
      detail: 'Signature/engine update check was requested from the Update Center.',
      outcome: 'info',
      actor: 'user',
    });
    try {
      const status = await commands.checkForUpdates();
      setUpdates(readyResource(status));
      recordAudit({
        kind: 'update_check',
        title: 'Update check completed',
        detail: status.message,
        outcome: status.state === 'failed' ? 'failure' : 'info',
        actor: 'system',
      });
    } catch (error) {
      const nativeError = toNativeError(error);
      setUpdates((prev) => errorResource<UpdateStatus>(nativeError, prev));
      recordAudit({
        kind: 'update_check',
        title: 'Update check failed',
        detail: nativeError.message,
        outcome: 'failure',
        actor: 'system',
      });
    }
  }, [recordAudit]);

  useEffect(() => {
    void refreshProtection();
    void refreshUpdates();
    void refreshQuarantine();
  }, [refreshProtection, refreshUpdates, refreshQuarantine]);

  /* ---------------- scanning ---------------- */

  const startScan = useCallback(
    async (profile: ScanProfile, targets?: string[]) => {
      // The native job manager assigns the job id; the first progress event
      // carries it and the reducer adopts it.
      dispatchScan({ type: 'start', profile, at: Date.now() });
      setSummary(null);
      recordAudit({
        kind: 'scan_started',
        title: `${profileLabel(profile)} scan requested`,
        detail:
          profile === 'custom'
            ? `Targets: ${(targets ?? []).join(', ') || 'none supplied'}`
            : 'Scan request forwarded to the native scanner adapter.',
        outcome: 'info',
        actor: 'user',
        target: profile,
      });

      try {
        const progress = await commands.startScan({ profile, targets });
        dispatchScan({ type: 'progress', progress });
      } catch (error) {
        const nativeError = toNativeError(error);
        if (nativeError.code === 'bridge_unavailable' || nativeError.code === 'not_configured') {
          dispatchScan({ type: 'unavailable', error: nativeError });
        } else {
          dispatchScan({ type: 'start_failed', error: nativeError });
        }
        recordAudit({
          kind: 'scan_failed',
          title: 'Scan could not start',
          detail: nativeError.message,
          outcome: 'failure',
          actor: 'system',
          target: profile,
        });
      }
    },
    [recordAudit],
  );

  const cancelScan = useCallback(async () => {
    if (scan.jobId === null || !canCancelScan({ ...scan, status: scan.status })) return;
    dispatchScan({ type: 'cancel_requested' });
    try {
      const progress = await commands.cancelScan(scan.jobId);
      dispatchScan({ type: 'cancelled', progress });
      recordAudit({
        kind: 'scan_cancelled',
        title: 'Scan cancelled',
        detail: `Scan ${scan.jobId} was cancelled by the user.`,
        outcome: 'cancelled',
        actor: 'user',
        target: scan.jobId,
      });
    } catch (error) {
      const nativeError = toNativeError(error);
      dispatchScan({ type: 'failed', error: nativeError });
      recordAudit({
        kind: 'scan_failed',
        title: 'Cancellation failed',
        detail: nativeError.message,
        outcome: 'failure',
        actor: 'system',
        target: scan.jobId,
      });
    }
  }, [scan, recordAudit]);

  const resetScan = useCallback(() => {
    dispatchScan({ type: 'reset' });
    setSummary(null);
  }, []);

  // Poll progress while a job is in flight.
  useEffect(() => {
    if (!isBusy(scan.status) || scan.jobId === null) return;

    let cancelled = false;
    const jobId = scan.jobId;

    const poll = async () => {
      try {
        const progress = await commands.getScanProgress(jobId);
        if (!cancelled) dispatchScan({ type: 'progress', progress });
      } catch (error) {
        if (cancelled) return;
        dispatchScan({ type: 'failed', error: toNativeError(error) });
      }
    };

    const id = window.setInterval(() => void poll(), PROGRESS_POLL_MS);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scan.status, scan.jobId, recordAudit]);

  // Fetch the result set exactly once per finished job (also covers jobs that
  // finish before the first poll).
  const summaryFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (scan.jobId === null || !isTerminal(scan.status)) return;
    if (summaryFetchedFor.current === scan.jobId) return;
    const jobId = scan.jobId;
    summaryFetchedFor.current = jobId;

    void commands
      .getScanResults(jobId)
      .then((result) => setSummary(result))
      .catch((error: unknown) => {
        const nativeError = toNativeError(error);
        recordAudit({
          kind: 'scan_failed',
          title: 'Scan results unavailable',
          detail: nativeError.message,
          outcome: 'failure',
          actor: 'system',
          target: jobId,
        });
      });
  }, [scan.jobId, scan.status, recordAudit]);

  // Elapsed-time ticker (only while a job is in flight).
  useEffect(() => {
    if (!isBusy(scan.status)) return;
    const id = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [scan.status]);

  /* ---------------- quarantine ---------------- */

  const withQuarantineAudit = useCallback(
    async (action: 'restore' | 'delete', id: string) => {
      recordAudit({
        kind: action === 'restore' ? 'restore' : 'delete',
        title: `${action === 'restore' ? 'Restore' : 'Permanent deletion'} requested`,
        detail: `Quarantine item ${id}.`,
        outcome: 'info',
        actor: 'user',
        target: id,
      });
      try {
        const items =
          action === 'restore'
            ? await commands.restoreQuarantineItem(id)
            : await commands.deleteQuarantineItem(id);
        setQuarantine(readyResource(items));
        recordAudit({
          kind: action === 'restore' ? 'restore' : 'delete',
          title: `${action === 'restore' ? 'Restore' : 'Deletion'} completed`,
          detail: `Quarantine item ${id} processed by the quarantine service.`,
          outcome: 'success',
          actor: 'system',
          target: id,
        });
      } catch (error) {
        const nativeError = toNativeError(error);
        recordAudit({
          kind: action === 'restore' ? 'restore_failed' : 'delete_failed',
          title: `${action === 'restore' ? 'Restore' : 'Deletion'} failed`,
          detail: nativeError.message,
          outcome: 'failure',
          actor: 'system',
          target: id,
        });
        setQuarantine((prev) => errorResource<QuarantineItem[]>(nativeError, prev));
      }
    },
    [recordAudit],
  );

  const restoreQuarantineItem = useCallback(
    (id: string) => withQuarantineAudit('restore', id),
    [withQuarantineAudit],
  );
  const deleteQuarantineItem = useCallback(
    (id: string) => withQuarantineAudit('delete', id),
    [withQuarantineAudit],
  );

  /* ---------------- settings ---------------- */

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSettings(next);
        const keys = Object.keys(patch).join(', ');
        recordAudit({
          kind: 'settings_changed',
          title: 'Settings updated',
          detail: `Updated: ${keys || 'nothing'}`,
          outcome: 'success',
          actor: 'user',
          target: keys || null,
        });
        return next;
      });
    },
    [recordAudit],
  );

  const history = useMemo(() => audit.map(toHistoryEntry), [audit]);

  const value = useMemo<AppStateValue>(
    () => ({
      appInfo,
      protection,
      scanner,
      updates,
      quarantine,
      scan,
      summary,
      audit,
      history,
      settings,
      theme,
      refreshProtection,
      refreshUpdates,
      refreshQuarantine,
      checkForUpdates,
      startScan,
      cancelScan,
      resetScan,
      restoreQuarantineItem,
      deleteQuarantineItem,
      updateSettings,
      recordAudit,
      elapsedMs: elapsedMs(scan, tick),
    }),
    [
      appInfo,
      protection,
      scanner,
      updates,
      quarantine,
      scan,
      summary,
      audit,
      history,
      settings,
      theme,
      refreshProtection,
      refreshUpdates,
      refreshQuarantine,
      checkForUpdates,
      startScan,
      cancelScan,
      resetScan,
      restoreQuarantineItem,
      deleteQuarantineItem,
      updateSettings,
      recordAudit,
      tick,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used inside <AppStateProvider>.');
  }
  return context;
}

function profileLabel(profile: ScanProfile): string {
  return profile === 'quick' ? 'Quick' : profile === 'full' ? 'Full' : 'Custom';
}

/** Convenience for mapping a thrown value into a NativeError in components. */
export function describeError(error: unknown): NativeError {
  return error instanceof NativeCommandError
    ? { code: error.code, message: error.message, hint: error.hint, traceId: error.traceId }
    : toNativeError(error);
}
