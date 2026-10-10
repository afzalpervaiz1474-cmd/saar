/**
 * Client-side scan state machine.
 *
 * The authoritative job state lives in the Rust `ScanJobManager`; this machine
 * only models what the UI is allowed to do while a job is in flight (disable
 * Start, enable Cancel, stop polling on terminal states, etc.). It is pure and
 * exhaustively unit tested, including cancellation and failure paths.
 */

import type { NativeError, ScanJobStatus, ScanProgress, ScanProfile } from '@/types/models';

export interface ScanUiState {
  status: ScanJobStatus;
  jobId: string | null;
  profile: ScanProfile | null;
  progress: ScanProgress | null;
  error: NativeError | null;
  /** Wall-clock start, used for the elapsed timer independent of engine events. */
  startedAtMs: number | null;
}

export type ScanAction =
  // The job id is assigned by the native job manager, not by the UI: the first
  // engine response is authoritative and is adopted by the reducer.
  | { type: 'start'; profile: ScanProfile; at: number }
  | { type: 'start_failed'; error: NativeError }
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'cancel_requested' }
  | { type: 'cancelled'; progress: ScanProgress | null }
  | { type: 'completed'; progress: ScanProgress | null }
  | { type: 'failed'; error: NativeError }
  | { type: 'unavailable'; error: NativeError }
  | { type: 'reset' };

export const initialScanState: ScanUiState = {
  status: 'idle',
  jobId: null,
  profile: null,
  progress: null,
  error: null,
  startedAtMs: null,
};

/** Statuses after which no further engine events are expected. */
const TERMINAL: ReadonlySet<ScanJobStatus> = new Set<ScanJobStatus>([
  'cancelled',
  'completed',
  'failed',
  'unavailable',
]);

export function isTerminal(status: ScanJobStatus): boolean {
  return TERMINAL.has(status);
}

export function isBusy(status: ScanJobStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'cancelling';
}

/** A scan may only start when nothing is in flight. */
export function canStart(state: ScanUiState): boolean {
  return !isBusy(state.status);
}

/** Cancel is offered while the job is running, and once while cancelling. */
export function canCancel(state: ScanUiState): boolean {
  return state.status === 'running' || state.status === 'starting';
}

export function scanReducer(state: ScanUiState, action: ScanAction): ScanUiState {
  switch (action.type) {
    case 'start':
      if (isBusy(state.status)) return state;
      return {
        status: 'starting',
        jobId: null,
        profile: action.profile,
        progress: null,
        error: null,
        startedAtMs: action.at,
      };

    case 'start_failed':
      return {
        ...state,
        status: 'failed',
        error: action.error,
        jobId: null,
        startedAtMs: null,
      };

    case 'progress': {
      // Adopt the engine-assigned id from the first response, then ignore any
      // late or stale events belonging to a different job.
      if (state.jobId !== null && action.progress.jobId !== state.jobId) return state;
      // Ignore events that arrive after a terminal state.
      if (isTerminal(state.status)) return state;
      return {
        ...state,
        status: action.progress.status,
        jobId: action.progress.jobId,
        profile: action.progress.profile,
        progress: action.progress,
        error: null,
      };
    }

    case 'cancel_requested':
      if (!canCancel(state)) return state;
      return { ...state, status: 'cancelling' };

    case 'cancelled':
      return {
        ...state,
        status: 'cancelled',
        progress: action.progress ?? state.progress,
        error: null,
      };

    case 'completed':
      return {
        ...state,
        status: 'completed',
        progress: action.progress ?? state.progress,
        error: null,
      };

    case 'failed':
      return { ...state, status: 'failed', error: action.error };

    case 'unavailable':
      return { ...state, status: 'unavailable', error: action.error, jobId: null };

    case 'reset':
      return initialScanState;

    default:
      return state;
  }
}

/** Elapsed milliseconds, preferring wall-clock time over engine-reported time. */
export function elapsedMs(state: ScanUiState, now: number): number {
  if (state.startedAtMs === null) return state.progress?.elapsedMs ?? 0;
  if (isTerminal(state.status) || state.status === 'idle') {
    return state.progress?.elapsedMs ?? 0;
  }
  return Math.max(0, now - state.startedAtMs);
}

/** Progress percentage when the engine reports a total, otherwise `null` (indeterminate). */
export function progressPercent(progress: ScanProgress | null): number | null {
  if (!progress || progress.totalFiles === null || progress.totalFiles <= 0) return null;
  const pct = (progress.scannedFiles / progress.totalFiles) * 100;
  return Math.min(100, Math.max(0, pct));
}
