import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  FileWarning,
  KeyRound,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, TextInput } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { formatBytes, formatTimestamp, titleCase, truncateMiddle } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import type { QuarantineItem } from '@/types/models';

type PendingAction = { type: 'restore' | 'delete'; item: QuarantineItem } | null;

/** Exact text the user must type to authorise irreversible deletion. */
const DELETE_CONFIRM_PHRASE = 'DELETE';

export function QuarantinePage(): JSX.Element {
  const { quarantine, protection, restoreQuarantineItem, deleteQuarantineItem, refreshQuarantine } =
    useAppState();

  const [pending, setPending] = useState<PendingAction>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = quarantine.data ?? [];
  const serviceComponent = useMemo(
    () => protection.data?.components.find((component) => component.id === 'quarantine_service'),
    [protection.data],
  );

  const serviceReady = serviceComponent?.state === 'active' && quarantine.status === 'ready';

  const closeDialog = () => {
    setPending(null);
    setConfirmPhrase('');
  };

  const runAction = async () => {
    if (!pending) return;
    const { type, item } = pending;
    setBusyId(item.id);
    try {
      if (type === 'restore') {
        await restoreQuarantineItem(item.id);
      } else {
        await deleteQuarantineItem(item.id);
      }
    } finally {
      setBusyId(null);
      closeDialog();
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Service state ---------------- */}
      <Card>
        <CardHeader
          title="Quarantine service"
          description="Isolates files only after a detection has been validated by the scan engine."
          icon={<Archive className="h-4 w-4" aria-hidden />}
          actions={
            quarantine.status === 'loading' ? (
              <StatusBadge
                presentation={{ tone: 'loading', label: 'Loading', description: 'Reading the vault.' }}
              />
            ) : serviceReady ? (
              <StatusBadge
                presentation={{ tone: 'ok', label: 'Active', description: 'Vault readable.' }}
              />
            ) : (
              <StatusBadge
                presentation={{
                  tone: 'neutral',
                  label: 'Not available',
                  description: 'The quarantine vault could not be read.',
                }}
              />
            )
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            {serviceComponent?.detail ??
              'The quarantine service interface is defined in the native layer; its state is unknown until the native bridge answers.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void refreshQuarantine()}
              loading={quarantine.status === 'loading'}
            >
              Refresh vault
            </Button>
            <span className="text-2xs text-ink-subtle">
              {items.length} item{items.length === 1 ? '' : 's'} currently isolated
              {quarantine.loadedAt ? ` · read ${formatTimestamp(quarantine.loadedAt)}` : ''}
            </span>
          </div>
        </CardBody>
      </Card>

      {quarantine.status === 'error' && quarantine.error ? (
        <Banner
          tone="neutral"
          title="Quarantine vault unreachable"
          action={
            <Button size="sm" variant="secondary" onClick={() => void refreshQuarantine()}>
              Retry
            </Button>
          }
        >
          <p>{quarantine.error.message}</p>
          {quarantine.error.hint ? <p className="mt-1">{quarantine.error.hint}</p> : null}
        </Banner>
      ) : null}

      {/* ---------------- Safety notice ---------------- */}
      <Banner tone="info" title="Quarantine rules enforced by ShieldForge">
        <ul className="list-inside list-disc space-y-1">
          <li>A file is only isolated after the scan engine reports a validated detection.</li>
          <li>Nothing is deleted automatically - deletion always requires typed confirmation.</li>
          <li>
            Restore writes back to the recorded original path and refuses to overwrite an existing
            file.
          </li>
          <li>
            Vault paths are engine-generated; user-supplied paths are rejected (no traversal, no
            absolute overwrite targets).
          </li>
        </ul>
      </Banner>

      {/* ---------------- Items ---------------- */}
      {quarantine.status === 'loading' && items.length === 0 ? (
        <Card>
          <CardBody className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Quarantine is empty"
          description="No file has been isolated. ShieldForge never moves a file to quarantine just because it looks unusual - only a real engine detection can put an item here."
        />
      ) : (
        <Card>
          <CardHeader
            title="Isolated items"
            description="Each action is confirmed, audited and reversible until permanently deleted."
            icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          />
          <CardBody className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-y border-line bg-surface-2/60">
                    <th className="px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                      Detection
                    </th>
                    <th className="px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                      Original path
                    </th>
                    <th className="px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                      Quarantined
                    </th>
                    <th className="px-4 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                      Size
                    </th>
                    <th className="px-4 py-2 text-right text-2xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-line/70 transition-colors hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3 align-middle">
                        <p className="text-xs font-medium text-ink">{item.detectionName}</p>
                        <p className="mt-0.5 text-2xs text-ink-subtle">
                          {titleCase(item.category)} · {item.engine}
                          {item.sha256 ? ` · ${truncateMiddle(item.sha256, 18)}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className="sf-mono block max-w-[22rem] truncate text-ink-muted"
                          title={item.originalPath}
                        >
                          {truncateMiddle(item.originalPath, 60)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-ink-muted">
                        {formatTimestamp(item.quarantinedAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-ink-muted">
                        {formatBytes(item.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                            disabled={!item.restorable || busyId === item.id}
                            title={item.restorable ? undefined : 'Original metadata is incomplete'}
                            onClick={() => setPending({ type: 'restore', item })}
                          >
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                            disabled={busyId === item.id}
                            onClick={() => setPending({ type: 'delete', item })}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
        <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Restoring a file returns it to its original location. Only restore items you trust and have
        verified; ShieldForge records every restore and deletion in Security History.
      </p>

      {/* ---------------- Confirmation ---------------- */}
      {pending ? (
        pending.type === 'restore' ? (
          <ConfirmDialog
            open
            tone="primary"
            title="Restore this file?"
            confirmLabel="Restore"
            busy={busyId === pending.item.id}
            onConfirm={() => void runAction()}
            onCancel={closeDialog}
            description={
              <div className="space-y-2">
                <p>
                  <span className="font-semibold text-ink">{pending.item.detectionName}</span> will be
                  written back to:
                </p>
                <p className="sf-mono break-all text-ink">{pending.item.originalPath}</p>
                <p>
                  The operation is refused if that path already exists or is outside the recorded
                  original location.
                </p>
              </div>
            }
          />
        ) : (
          <ConfirmDialog
            open
            tone="danger"
            title="Permanently delete this item?"
            confirmLabel="Delete permanently"
            confirmDisabled={confirmPhrase !== DELETE_CONFIRM_PHRASE}
            busy={busyId === pending.item.id}
            onConfirm={() => void runAction()}
            onCancel={closeDialog}
            description={
              <div className="space-y-3">
                <p>
                  This removes <span className="font-semibold text-ink">{pending.item.detectionName}</span>{' '}
                  from the quarantine vault. It cannot be recovered.
                </p>
                <p className="sf-mono break-all text-ink">{pending.item.originalPath}</p>
                <div className="space-y-1.5">
                  <p className="text-ink">
                    Type <span className="sf-mono font-semibold">{DELETE_CONFIRM_PHRASE}</span> to
                    confirm:
                  </p>
                  <TextInput
                    value={confirmPhrase}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Type DELETE to confirm"
                    onChange={(event) => setConfirmPhrase(event.target.value)}
                    className={cn(
                      confirmPhrase.length > 0 && confirmPhrase !== DELETE_CONFIRM_PHRASE
                        ? 'border-danger/60'
                        : '',
                    )}
                  />
                </div>
              </div>
            }
          />
        )
      ) : null}

      <Field label="Vault integrity" hint="Vault entries are engine-generated and integrity checked by the native service.">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
          {items.length > 0
            ? `${items.filter((item) => item.sha256 !== null).length} of ${items.length} entries carry a SHA-256 digest.`
            : 'No entries to verify.'}
        </div>
      </Field>

      <p className="flex items-center gap-2 text-2xs text-ink-subtle">
        <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
        Automatic quarantine on detection is not enabled in Phase 1: isolation happens only when a
        real engine detection exists and the user confirms it.
      </p>
    </div>
  );
}
