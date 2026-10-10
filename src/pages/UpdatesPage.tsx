import { Download, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoRow } from '@/components/common/StatTile';
import { formatRelative, formatTimestamp } from '@/lib/format';
import { UPDATE_PRESENTATION } from '@/lib/statusTone';
import { useAppState } from '@/state/AppState';
import { APP_VERSION } from '@/lib/constants';

export function UpdatesPage(): JSX.Element {
  const { updates, scanner, checkForUpdates, refreshUpdates } = useAppState();
  const status = updates.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Update status"
          description="Versions reported by the engine and the signature update service."
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          actions={
            status ? (
              <StatusBadge presentation={UPDATE_PRESENTATION[status.state]} />
            ) : updates.status === 'loading' ? (
              <StatusBadge
                presentation={{ tone: 'loading', label: 'Checking', description: 'Loading status.' }}
              />
            ) : (
              <StatusBadge
                presentation={{
                  tone: 'neutral',
                  label: 'Unavailable',
                  description: 'The update service could not be queried.',
                }}
              />
            )
          }
        />
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <InfoRow label="Application version" value={APP_VERSION} mono />
            <InfoRow label="Engine version" value={status?.engineVersion ?? 'Not configured'} mono />
            <InfoRow
              label="Signature database"
              value={status?.installedSignatureVersion ?? 'Not configured'}
              mono
            />
            <InfoRow
              label="Signature released"
              value={formatTimestamp(status?.installedSignatureReleasedAt ?? null)}
            />
            <InfoRow
              label="Latest available"
              value={status?.latestSignatureVersion ?? 'Unknown'}
              mono
            />
            <InfoRow
              label="Last successful update"
              value={
                status?.lastSuccessAt
                  ? `${formatTimestamp(status.lastSuccessAt)} (${formatRelative(status.lastSuccessAt)})`
                  : 'Never'
              }
            />
            <InfoRow
              label="Last check"
              value={
                status?.lastCheckedAt
                  ? `${formatTimestamp(status.lastCheckedAt)} (${formatRelative(status.lastCheckedAt)})`
                  : 'Never'
              }
            />
            <InfoRow
              label="Integrity verification"
              value={
                status
                  ? status.signaturesVerified
                    ? 'Verified (authenticated source)'
                    : 'Not verified - no trusted source configured'
                  : '-'
              }
            />
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" aria-hidden />}
              onClick={() => void checkForUpdates()}
              loading={updates.status === 'loading'}
            >
              Check for updates
            </Button>
            <Button
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" aria-hidden />}
              onClick={() => void refreshUpdates()}
            >
              Refresh status
            </Button>
            <span className="text-2xs text-ink-subtle">
              {status?.message ?? 'No update status has been reported yet.'}
            </span>
          </div>

          {updates.status === 'error' && updates.error ? (
            <Banner
              tone="neutral"
              title="Update service unreachable"
              action={
                <Button size="sm" variant="secondary" onClick={() => void refreshUpdates()}>
                  Retry
                </Button>
              }
            >
              <p>{updates.error.message}</p>
              {updates.error.hint ? <p className="mt-1">{updates.error.hint}</p> : null}
              <p className="mt-1 opacity-80">
                Code: <span className="sf-mono">{updates.error.code}</span>
              </p>
            </Banner>
          ) : null}

          {status?.error ? (
            <Banner tone="danger" title={status.error.message}>
              {status.error.hint}
            </Banner>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Update security model"
          description="How ShieldForge intends to protect the update channel."
          icon={<KeyRound className="h-4 w-4" aria-hidden />}
        />
        <CardBody className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <p>
            Security updates are a high-value attack surface. The update path is therefore designed
            around authenticated, integrity-verified packages:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Every package must carry a signature from an offline signing key.</li>
            <li>Signature verification happens before any content is unpacked or applied.</li>
            <li>
              An unsigned, malformed, or signature-mismatched package is rejected and reported - it is
              never treated as trusted.
            </li>
            <li>Downloads are fetched over TLS with certificate validation and pinned hosts.</li>
            <li>Rollback metadata is written so a failed update leaves the previous version intact.</li>
          </ul>
          <p className="text-warn">
            No update source is configured in Phase 1, so the button above reports “not configured”
            rather than inventing a version number.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Engine"
          description="Scanning engine currently registered with the application."
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
        />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <InfoRow label="Adapter" value={scanner.data?.displayName ?? 'None registered'} />
            <InfoRow label="Kind" value={scanner.data?.kind ?? '-'} />
            <InfoRow label="Available" value={scanner.data ? (scanner.data.available ? 'Yes' : 'No') : '-'} />
            <InfoRow
              label="Reason"
              value={scanner.data?.unavailableReason ?? (scanner.data?.available ? 'Self-check passed' : '-')}
            />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
