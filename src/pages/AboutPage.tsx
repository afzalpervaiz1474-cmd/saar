import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  FlaskConical,
  Info,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionHeading } from '@/components/ui/Card';
import { InfoRow } from '@/components/common/StatTile';
import { cn } from '@/lib/cn';
import { APP_NAME, APP_VERSION, PHASE } from '@/lib/constants';
import { formatTimestamp } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { validateQuarantineId, validateScanPath } from '@/lib/validation';

interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export function AboutPage(): JSX.Element {
  const { appInfo, protection, scanner, updates, quarantine } = useAppState();
  const [selfTestResult, setSelfTestResult] = useState<Check[] | null>(null);
  const [copied, setCopied] = useState(false);

  const info = appInfo.data;

  const runtimeChecks = useMemo<Check[]>(
    () => [
      {
        id: 'bridge',
        label: 'Native bridge attached',
        pass: info?.nativeBridge === 'tauri',
        detail:
          info?.nativeBridge === 'tauri'
            ? 'Running inside the Tauri shell; native commands are available.'
            : 'Running in a browser preview: native commands are unreachable, so every component reports an honest unavailable state.',
      },
      {
        id: 'protection',
        label: 'Protection snapshot received',
        pass: protection.status === 'ready',
        detail:
          protection.status === 'ready'
            ? `Snapshot generated ${formatTimestamp(protection.data?.generatedAt ?? null)}.`
            : (protection.error?.message ?? 'No snapshot available.'),
      },
      {
        id: 'scanner',
        label: 'Scanning engine configured',
        pass: scanner.data?.available === true,
        detail:
          scanner.data?.unavailableReason ??
          (scanner.data?.available ? `Engine: ${scanner.data.displayName}` : 'Unknown.'),
      },
      {
        id: 'updates',
        label: 'Update service reachable',
        pass: updates.status === 'ready',
        detail: updates.status === 'ready' ? updates.data?.message ?? '' : (updates.error?.message ?? 'Unreachable.'),
      },
      {
        id: 'quarantine',
        label: 'Quarantine vault readable',
        pass: quarantine.status === 'ready',
        detail:
          quarantine.status === 'ready'
            ? `${quarantine.data?.length ?? 0} item(s) isolated.`
            : (quarantine.error?.message ?? 'Vault not readable.'),
      },
      {
        id: 'storage',
        label: 'Local storage available',
        pass: storageAvailable(),
        detail: 'Preferences and the local event log require local storage.',
      },
      {
        id: 'intl',
        label: 'Internationalisation APIs',
        pass: typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function',
        detail: 'Used for relative timestamps and number formatting.',
      },
      {
        id: 'theme',
        label: 'Theme engine active',
        pass: typeof document !== 'undefined' && document.documentElement.dataset.theme !== undefined,
        detail: `Active theme: ${typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'unknown'}`,
      },
    ],
    [info, protection, scanner, updates, quarantine],
  );

  const runSelfTest = () => {
    setSelfTestResult([
      check('Rejects traversal', validateScanPath('C:\\Users\\..\\..\\Windows').ok === false),
      check('Rejects relative paths', validateScanPath('Documents/files').ok === false),
      check('Rejects empty input', validateScanPath('   ').ok === false),
      check('Rejects NUL byte', validateScanPath('/home/user\u0000bad').ok === false),
      check('Rejects illegal characters', validateScanPath('/home/user/*.txt').ok === false),
      check('Accepts absolute Windows path', validateScanPath('C:\\Users\\Documents').ok),
      check('Accepts absolute POSIX path', validateScanPath('/home/user/Documents').ok),
      check('Rejects malformed quarantine id', validateQuarantineId('../../etc/passwd').ok === false),
      check('Accepts well-formed quarantine id', validateQuarantineId('qtn_9fA2bC3d').ok),
    ]);
  };

  const copyDiagnostics = async () => {
    const payload = {
      application: APP_NAME,
      version: APP_VERSION,
      phase: PHASE,
      generatedAt: new Date().toISOString(),
      appInfo: info,
      checks: runtimeChecks,
      selfTest: selfTestResult,
      userAgent: navigator.userAgent,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Identity ---------------- */}
      <Card>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
            <ShieldAlert className="h-7 w-7" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{APP_NAME}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{PHASE}</p>
            <p className="mt-2 text-xs text-ink-subtle">
              A cross-platform security product under development. Windows desktop first; macOS and
              Android planned as separate native implementations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<ClipboardCopy className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => void copyDiagnostics()}
            >
              {copied ? 'Copied' : 'Copy diagnostics'}
            </Button>
          </div>
        </div>
        <div className="border-t border-line px-5 py-4">
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Version" value={APP_VERSION} mono />
            <InfoRow label="Build target" value={info?.buildTarget ?? '-'} />
            <InfoRow label="Platform" value={info?.platformDetail ?? '-'} />
            <InfoRow label="Architecture" value={info?.arch ?? '-'} mono />
            <InfoRow
              label="Native bridge"
              value={info?.nativeBridge === 'tauri' ? 'Attached (Tauri)' : 'Not attached'}
            />
            <InfoRow label="Build time" value={formatTimestamp(info?.buildTime ?? null)} />
          </dl>
        </div>
      </Card>

      {/* ---------------- Runtime checks ---------------- */}
      <section>
        <SectionHeading
          title="Runtime diagnostics"
          description="Live checks against the environment this copy is running in."
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden />}
              onClick={runSelfTest}
            >
              Run client self-test
            </Button>
          }
        />
        <Card>
          <CardBody className="space-y-2">
            {runtimeChecks.map((checkItem) => (
              <CheckRow key={checkItem.id} check={checkItem} />
            ))}
          </CardBody>
        </Card>
      </section>

      {selfTestResult ? (
        <section>
          <SectionHeading
            title="Client self-test"
            description="Input validation executed in this process. No files are read or written."
          />
          <Card>
            <CardBody className="space-y-2">
              {selfTestResult.map((checkItem) => (
                <CheckRow key={checkItem.id} check={checkItem} />
              ))}
              <p className="pt-2 text-2xs text-ink-subtle">
                {selfTestResult.filter((item) => item.pass).length} of {selfTestResult.length}{' '}
                assertions passed. Equivalent assertions run in Rust against the authoritative
                validator.
              </p>
            </CardBody>
          </Card>
        </section>
      ) : null}

      {/* ---------------- Limitations ---------------- */}
      <Card>
        <CardHeader
          title="Known limitations"
          description="Documented, unimplemented and not-yet-verified areas."
          icon={<Info className="h-4 w-4" aria-hidden />}
        />
        <CardBody>
          <ul className="space-y-2 text-xs leading-relaxed text-ink-muted">
            {[
              'No scanning engine is configured. Scans report “Scanner not configured” and produce no results.',
              'Real-time / on-access protection is not implemented on any platform.',
              'The quarantine service interface exists, but isolation requires a validated engine detection.',
              'No update source is configured; signature and engine versions are reported as unavailable.',
              'macOS (Swift/Endpoint Security) and Android (Kotlin) support are design-level only - no code.',
              'The event log is local-only and not tamper-proof; the authoritative audit log is the Rust SecurityAuditLog.',
              'No benchmark, detection-rate or independent lab evidence exists for this product yet.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Banner tone="info" title="Scope of this release">
        This build is a Phase 1 development milestone: a working console, typed native interfaces,
        automated tests and honest component states. It is not a substitute for an installed
        antivirus product. Keep your platform's built-in protection enabled.
      </Banner>

      <Card>
        <CardHeader
          title="Third-party components"
          description="Runtime and build-time dependencies."
          icon={<Cpu className="h-4 w-4" aria-hidden />}
        />
        <CardBody>
          <ul className="space-y-1.5 text-xs text-ink-muted">
            <LicenseRow name="React" license="MIT" use="User interface" />
            <LicenseRow name="TypeScript / Vite / Vitest" license="MIT / Apache-2.0" use="Build and test tooling" />
            <LicenseRow name="Tauri" license="MIT / Apache-2.0" use="Desktop shell and IPC" />
            <LicenseRow name="Tailwind CSS" license="MIT" use="Styling system" />
            <LicenseRow name="Lucide" license="ISC" use="Iconography" />
          </ul>
        </CardBody>
      </Card>

      <p className="flex items-center gap-2 text-2xs text-ink-subtle">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        Diagnostics contain no file contents, no scan targets and no personal identifiers.
      </p>
    </div>
  );
}

function CheckRow({ check }: { check: Check }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium text-ink">
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full',
              check.pass ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn',
            )}
          >
            {check.pass ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden />
            ) : (
              <XCircle className="h-3 w-3" aria-hidden />
            )}
          </span>
          {check.label}
        </p>
        {check.detail ? (
          <p className="mt-1 break-words text-2xs leading-relaxed text-ink-subtle">{check.detail}</p>
        ) : null}
      </div>
      <span
        className={cn(
          'shrink-0 text-2xs font-semibold uppercase tracking-[0.06em]',
          check.pass ? 'text-accent' : 'text-warn',
        )}
      >
        {check.pass ? 'Pass' : 'Attention'}
      </span>
    </div>
  );
}

function LicenseRow({ name, license, use }: { name: string; license: string; use: string }): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-ink">
        {name} <span className="text-ink-subtle">· {use}</span>
      </span>
      <span className="shrink-0 text-ink-subtle">{license}</span>
    </li>
  );
}

function check(label: string, pass: boolean): Check {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    pass,
    detail: pass ? 'Assertion passed.' : 'Assertion failed - investigate before shipping.',
  };
}

function storageAvailable(): boolean {
  try {
    const key = '__shieldforge_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
