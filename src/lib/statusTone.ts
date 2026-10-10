/**
 * Status → presentation mapping.
 *
 * The single place where a *security* state is translated into a colour.
 * Contract: only `active` may render as the "ok" (green/emerald) tone.
 * Everything else renders neutral, warning, danger or "unavailable".
 */

import type { ComponentState, Outcome, ScanJobStatus, ScanVerdict, UpdateState } from '@/types/models';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'loading';

export interface StatusPresentation {
  tone: Tone;
  label: string;
  /** Short explanation suitable for a tooltip / detail line. */
  description: string;
}

const ACTIVE: StatusPresentation = {
  tone: 'ok',
  label: 'Active',
  description: 'Component confirmed operational by the native layer.',
};

export const COMPONENT_PRESENTATION: Record<ComponentState, StatusPresentation> = {
  active: ACTIVE,
  degraded: {
    tone: 'warn',
    label: 'Degraded',
    description: 'Component is running but reported a problem that needs attention.',
  },
  not_implemented: {
    tone: 'neutral',
    label: 'Not implemented',
    description: 'This component has no implementation yet in this release.',
  },
  not_configured: {
    tone: 'info',
    label: 'Not configured',
    description: 'The component exists but has no engine configured.',
  },
  permission_required: {
    tone: 'warn',
    label: 'Permission required',
    description: 'The component needs an operating-system permission to operate.',
  },
  unavailable: {
    tone: 'neutral',
    label: 'Unavailable',
    description: 'The component could not be reached or is not supported on this platform.',
  },
  error: {
    tone: 'danger',
    label: 'Error',
    description: 'The component failed while reporting its state.',
  },
};

export const SCAN_STATUS_PRESENTATION: Record<ScanJobStatus, StatusPresentation> = {
  idle: { tone: 'neutral', label: 'Idle', description: 'No scan has been started.' },
  starting: { tone: 'loading', label: 'Starting', description: 'Preparing the scan job.' },
  running: { tone: 'loading', label: 'Running', description: 'Scan in progress.' },
  cancelling: { tone: 'neutral', label: 'Cancelling', description: 'Waiting for the engine to stop.' },
  cancelled: { tone: 'info', label: 'Cancelled', description: 'The scan was stopped by the user.' },
  completed: { tone: 'ok', label: 'Completed', description: 'The scan finished.' },
  failed: { tone: 'danger', label: 'Failed', description: 'The scan did not finish.' },
  unavailable: {
    tone: 'neutral',
    label: 'Unavailable',
    description: 'No scan engine is configured.',
  },
};

export const VERDICT_PRESENTATION: Record<ScanVerdict, StatusPresentation> = {
  clean: {
    tone: 'ok',
    label: 'Clean',
    description: 'No detection reported for this object. This is not a guarantee of safety.',
  },
  detected: { tone: 'danger', label: 'Detected', description: 'The engine reported a detection.' },
  unsupported: {
    tone: 'info',
    label: 'Unsupported',
    description: 'The engine could not inspect this object type.',
  },
  error: { tone: 'warn', label: 'Error', description: 'The engine failed to scan this object.' },
  skipped: { tone: 'neutral', label: 'Skipped', description: 'Excluded by policy or size limits.' },
};

export const UPDATE_PRESENTATION: Record<UpdateState, StatusPresentation> = {
  up_to_date: { tone: 'ok', label: 'Up to date', description: 'Signature data is current.' },
  update_available: { tone: 'warn', label: 'Update available', description: 'A newer update exists.' },
  checking: { tone: 'loading', label: 'Checking', description: 'Contacting the update source.' },
  not_configured: {
    tone: 'info',
    label: 'Not configured',
    description: 'No verified update source is configured.',
  },
  failed: { tone: 'danger', label: 'Failed', description: 'The update check failed.' },
  unavailable: { tone: 'neutral', label: 'Unavailable', description: 'Update service unreachable.' },
};

export const OUTCOME_PRESENTATION: Record<Outcome, StatusPresentation> = {
  success: { tone: 'ok', label: 'Success', description: 'The action completed.' },
  failure: { tone: 'danger', label: 'Failed', description: 'The action did not complete.' },
  cancelled: { tone: 'neutral', label: 'Cancelled', description: 'The action was cancelled.' },
  info: { tone: 'info', label: 'Info', description: 'Informational event.' },
};

/** Hero badge on the overview. Deliberately strict about what counts as "protected". */
export function overallTone(snapshot: {
  fullyOperational: boolean;
  engineConfigured: boolean;
}): { tone: Tone; label: string; description: string } {
  if (snapshot.fullyOperational) {
    return {
      tone: 'ok',
      label: 'All components active',
      description: 'Every implemented protection component reported an active state.',
    };
  }
  if (!snapshot.engineConfigured) {
    return {
      tone: 'neutral',
      label: 'Protection not configured',
      description:
        'No scanning engine is configured yet. Detection, quarantine and real-time protection are inactive.',
    };
  }
  return {
    tone: 'warn',
    label: 'Partial protection',
    description: 'At least one component is not active. Open Protection Status for details.',
  };
}

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-accent',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-ink-muted',
  neutral: 'text-ink-subtle',
  loading: 'text-signal',
};

export const TONE_BG: Record<Tone, string> = {
  ok: 'bg-accent-soft/60 text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-ink-muted',
  neutral: 'bg-surface-3 text-ink-subtle',
  loading: 'bg-signal-soft text-signal',
};

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-ink-subtle',
  neutral: 'bg-ink-subtle/60',
  loading: 'bg-signal animate-pulse-ring',
};
