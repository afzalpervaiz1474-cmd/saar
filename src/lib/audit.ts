/**
 * Local audit log.
 *
 * Security-relevant *UI* actions (scan requests, quarantine requests, settings
 * changes, failed native calls) are appended here so the Security History and
 * About/Diagnostics pages can show a real, verifiable trail even before the
 * native `SecurityAuditLog` is wired up.
 *
 * This log is advisory and local-only. The authoritative audit log is the Rust
 * `SecurityAuditLog` (append-only, integrity-checked); this module never
 * claims to be tamper-proof.
 */

import { MAX_AUDIT_ENTRIES, STORAGE_KEYS } from './constants';
import type { AuditEvent, HistoryEntry, HistoryKind, Outcome } from '@/types/models';

let counter = 0;

export function createId(prefix: string): string {
  counter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`;
}

export function createAuditEvent(input: {
  kind: HistoryKind;
  title: string;
  detail: string;
  outcome: Outcome;
  actor?: AuditEvent['actor'];
  target?: string | null;
  at?: string;
}): AuditEvent {
  return {
    id: createId('evt'),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    outcome: input.outcome,
    actor: input.actor ?? 'user',
    target: input.target ?? null,
  };
}

/** Newest first, bounded to `MAX_AUDIT_ENTRIES`. */
export function mergeAudit(existing: AuditEvent[], incoming: AuditEvent[]): AuditEvent[] {
  const byId = new Map<string, AuditEvent>();
  for (const event of [...incoming, ...existing]) {
    byId.set(event.id, event);
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_AUDIT_ENTRIES);
}

export function loadAudit(): AuditEvent[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.audit);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is AuditEvent => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<AuditEvent>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.at === 'string' &&
          typeof candidate.title === 'string' &&
          typeof candidate.kind === 'string' &&
          typeof candidate.outcome === 'string'
        );
      })
      .slice(0, MAX_AUDIT_ENTRIES);
  } catch {
    return [];
  }
}

export function saveAudit(events: AuditEvent[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify(events.slice(0, MAX_AUDIT_ENTRIES)));
  } catch {
    /* Non-fatal: the audit trail simply will not survive a restart. */
  }
}

export function toHistoryEntry(event: AuditEvent): HistoryEntry {
  const { actor: _actor, target: _target, ...history } = event;
  return history;
}
