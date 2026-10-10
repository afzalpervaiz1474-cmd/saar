import { useState } from 'react';
import {
  Bell,
  Database,
  Eye,
  KeyRound,
  Layers,
  Lock,
  Palette,
  ScanSearch,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { LIMITS, validateRange } from '@/lib/validation';
import { STORAGE_KEYS } from '@/lib/constants';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { useAppState } from '@/state/AppState';
import type { Settings } from '@/types/models';

export function SettingsPage(): JSX.Element {
  const { settings, updateSettings, history } = useAppState();
  const [confirmReset, setConfirmReset] = useState(false);
  const [numberErrors, setNumberErrors] = useState<Record<string, string | null>>({});

  const updateScan = (patch: Partial<Settings['scan']>) =>
    updateSettings({ scan: { ...settings.scan, ...patch } });
  const updateNotifications = (patch: Partial<Settings['notifications']>) =>
    updateSettings({ notifications: { ...settings.notifications, ...patch } });
  const updatePrivacy = (patch: Partial<Settings['privacy']>) =>
    updateSettings({ privacy: { ...settings.privacy, ...patch } });

  const setNumber = (
    key: 'maxFileSizeMb' | 'maxDurationMinutes',
    raw: string,
    limits: { min: number; max: number },
  ) => {
    const value = Number(raw);
    const result = validateRange(value, limits.min, limits.max);
    if (!result.ok) {
      setNumberErrors((prev) => ({ ...prev, [key]: result.message }));
      return;
    }
    setNumberErrors((prev) => ({ ...prev, [key]: null }));
    updateScan({ [key]: value });
  };

  const resetAll = () => {
    updateSettings(DEFAULT_SETTINGS);
    setConfirmReset(false);
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Appearance ---------------- */}
      <Card>
        <CardHeader
          title="Appearance"
          description="Both themes are designed for long sessions and tested for contrast."
          icon={<Palette className="h-4 w-4" aria-hidden />}
        />
        <CardBody className="space-y-1">
          <div className="flex flex-wrap gap-2 pb-2">
            {(
              [
                { id: 'dark', label: 'Dark' },
                { id: 'light', label: 'Light' },
                { id: 'system', label: 'System' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={settings.theme === option.id}
                onClick={() => updateSettings({ theme: option.id })}
                className={
                  settings.theme === option.id
                    ? 'rounded-lg border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent'
                    : 'rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-subtle">
            “System” follows the operating-system preference and updates live.
          </p>
        </CardBody>
      </Card>

      {/* ---------------- Scan preferences ---------------- */}
      <section>
        <SectionHeading
          title="Scan preferences"
          description="Applied to every profile. The native job manager enforces these limits too."
        />
        <Card>
          <CardBody className="space-y-1">
            <Toggle
              id="scan-archives"
              label="Scan inside archives"
              description="Inspect archive contents (zip, rar, 7z) when the engine supports it."
              checked={settings.scan.scanArchives}
              onChange={(next) => updateScan({ scanArchives: next })}
            />
            <div className="sf-divider" />
            <Toggle
              id="scan-symlinks"
              label="Follow symbolic links"
              description="Off by default: following links can cause loops and scan the same file twice."
              checked={settings.scan.followSymlinks}
              onChange={(next) => updateScan({ followSymlinks: next })}
            />
            <div className="sf-divider" />
            <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-3">
              <Field
                label="Max file size (MB)"
                htmlFor="max-file-size"
                error={numberErrors['maxFileSizeMb'] ?? null}
                hint={`Files above this are skipped. Range ${LIMITS.maxFileSizeMb.min}-${LIMITS.maxFileSizeMb.max}.`}
              >
                <TextInput
                  id="max-file-size"
                  type="number"
                  inputMode="numeric"
                  value={settings.scan.maxFileSizeMb}
                  min={LIMITS.maxFileSizeMb.min}
                  max={LIMITS.maxFileSizeMb.max}
                  onChange={(event) =>
                    setNumber('maxFileSizeMb', event.target.value, LIMITS.maxFileSizeMb)
                  }
                />
              </Field>
              <Field
                label="Job timeout (minutes)"
                htmlFor="job-timeout"
                error={numberErrors['maxDurationMinutes'] ?? null}
                hint={`Hard stop for a single job. Range ${LIMITS.maxDurationMinutes.min}-${LIMITS.maxDurationMinutes.max}.`}
              >
                <TextInput
                  id="job-timeout"
                  type="number"
                  inputMode="numeric"
                  value={settings.scan.maxDurationMinutes}
                  min={LIMITS.maxDurationMinutes.min}
                  max={LIMITS.maxDurationMinutes.max}
                  onChange={(event) =>
                    setNumber('maxDurationMinutes', event.target.value, LIMITS.maxDurationMinutes)
                  }
                />
              </Field>
              <Field
                label="Results page size"
                htmlFor="page-size"
                hint={`Rows per page in Scan Results. Range ${LIMITS.resultsPageSize.min}-${LIMITS.resultsPageSize.max}.`}
              >
                <TextInput
                  id="page-size"
                  type="number"
                  inputMode="numeric"
                  value={settings.resultsPageSize}
                  min={LIMITS.resultsPageSize.min}
                  max={LIMITS.resultsPageSize.max}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (validateRange(value, LIMITS.resultsPageSize.min, LIMITS.resultsPageSize.max).ok) {
                      updateSettings({ resultsPageSize: value });
                    }
                  }}
                />
              </Field>
            </div>
            <p className="flex items-start gap-2 pt-3 text-2xs text-ink-subtle">
              <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Limits are advisory for the UI and authoritative in Rust: the job manager re-validates
              them before starting work.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* ---------------- Notifications ---------------- */}
      <Card>
        <CardHeader
          title="Notifications"
          description="Desktop notifications are delivered by the shell once a component can produce the event."
          icon={<Bell className="h-4 w-4" aria-hidden />}
        />
        <CardBody className="space-y-1">
          <Toggle
            id="notify-scan"
            label="Scan completed"
            checked={settings.notifications.scanCompleted}
            onChange={(next) => updateNotifications({ scanCompleted: next })}
          />
          <div className="sf-divider" />
          <Toggle
            id="notify-threat"
            label="Threat detected"
            description="There is no engine in Phase 1, so this event cannot fire yet."
            checked={settings.notifications.threatDetected}
            onChange={(next) => updateNotifications({ threatDetected: next })}
          />
          <div className="sf-divider" />
          <Toggle
            id="notify-update"
            label="Update available"
            checked={settings.notifications.updateAvailable}
            onChange={(next) => updateNotifications({ updateAvailable: next })}
          />
        </CardBody>
      </Card>

      {/* ---------------- Privacy ---------------- */}
      <section>
        <SectionHeading
          title="Privacy"
          description="ShieldForge defaults to local scanning and minimal data collection."
        />
        <Card>
          <CardBody className="space-y-1">
            <Toggle
              id="privacy-telemetry"
              label="Share threat telemetry"
              description="There is no telemetry backend in Phase 1. This stays off and sends nothing."
              checked={settings.privacy.shareThreatTelemetry}
              disabled
              disabledReason="Locked off: no telemetry backend exists yet."
              onChange={() => undefined}
            />
            <div className="sf-divider" />
            <Toggle
              id="privacy-cloud"
              label="Cloud reputation lookup"
              description="Requires uploading file hashes, never file contents, and only with explicit consent."
              checked={settings.privacy.cloudLookup}
              disabled
              disabledReason="Locked off: no cloud lookup service is configured."
              onChange={() => undefined}
            />
            <div className="sf-divider" />
            <div className="pt-3">
              <Field
                label="Keep history for (days)"
                htmlFor="history-days"
                hint={`Range ${LIMITS.keepHistoryDays.min}-${LIMITS.keepHistoryDays.max}. Stored only on this device.`}
              >
                <TextInput
                  id="history-days"
                  type="number"
                  inputMode="numeric"
                  className="max-w-[10rem]"
                  value={settings.privacy.keepHistoryDays}
                  min={LIMITS.keepHistoryDays.min}
                  max={LIMITS.keepHistoryDays.max}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (validateRange(value, LIMITS.keepHistoryDays.min, LIMITS.keepHistoryDays.max).ok) {
                      updatePrivacy({ keepHistoryDays: value });
                    }
                  }}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Banner tone="info" title="What ShieldForge stores locally">
          <ul className="list-inside list-disc space-y-1">
            <li>
              Preferences and the event log live in local storage (
              <span className="sf-mono">{STORAGE_KEYS.settings}</span>,{' '}
              <span className="sf-mono">{STORAGE_KEYS.audit}</span>).
            </li>
            <li>
              Your files are never uploaded. On-demand scanning is local; cloud-assisted analysis
              would require a separate, explicit opt-in.
            </li>
            <li>Scan targets you type are validated locally and never leave the device.</li>
          </ul>
        </Banner>
      </section>

      {/* ---------------- Permissions ---------------- */}
      <Card>
        <CardHeader
          title="Permissions"
          description="What the application asks for and why."
          icon={<KeyRound className="h-4 w-4" aria-hidden />}
        />
        <CardBody className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <PermissionRow
            icon={ScanSearch}
            title="Read access to scan targets"
            detail="Requested for the folders you choose. The native layer re-validates every path and refuses traversal, symlink escapes (unless enabled) and non-absolute paths."
          />
          <PermissionRow
            icon={Layers}
            title="Quarantine vault access"
            detail="Only the application-owned vault directory. Restore targets must match the recorded original path."
          />
          <PermissionRow
            icon={Database}
            title="Local settings storage"
            detail="Used for theme, scan limits and the event log. Cleared from Settings → Reset."
          />
          <PermissionRow
            icon={Lock}
            title="Not requested"
            detail="No camera, microphone, location, contacts, browser data or network upload permission is used by Phase 1."
          />
        </CardBody>
      </Card>

      {/* ---------------- Reset ---------------- */}
      <Card>
        <CardHeader
          title="Reset"
          description={`${history.length} local event${history.length === 1 ? '' : 's'} currently stored.`}
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)}>
              Restore defaults
            </Button>
          }
        />
        <CardBody>
          <p className="text-xs leading-relaxed text-ink-muted">
            Restores every preference on this page to the shipped defaults. It does not delete the
            event log and does not change any engine configuration.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        tone="primary"
        title="Restore default settings?"
        confirmLabel="Restore defaults"
        onConfirm={resetAll}
        onCancel={() => setConfirmReset(false)}
        description="Your theme, scan limits, notification and history-retention preferences return to the shipped defaults."
      />

      <p className="flex items-center gap-2 text-2xs text-ink-subtle">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        Privacy defaults are enforced in code: telemetry and cloud lookup are hard-locked to off in
        Phase 1 and cannot be enabled from the UI.
      </p>
    </div>
  );
}

function PermissionRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof ScanSearch;
  title: string;
  detail: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div>
        <p className="text-xs font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}
