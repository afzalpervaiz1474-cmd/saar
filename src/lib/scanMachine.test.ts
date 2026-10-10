import { describe, expect, it } from 'vitest';
import {
  canCancel,
  canStart,
  elapsedMs,
  initialScanState,
  isBusy,
  isTerminal,
  progressPercent,
  scanReducer,
  type ScanUiState,
} from '@/lib/scanMachine';
import { progressFixture } from '@/test/fixtures';
import type { NativeError, ScanProgress } from '@/types/models';

const error: NativeError = {
  code: 'engine_error',
  message: 'Engine crashed.',
  hint: null,
  traceId: 'trace-1',
};

function running(overrides: Partial<ScanProgress> = {}): ScanProgress {
  return progressFixture({ status: 'running', finishedAt: null, ...overrides });
}

describe('scanReducer', () => {
  it('starts a job and clears previous error state', () => {
    const state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 1_000 });
    // The engine owns the job id, so a freshly started job has none yet.
    expect(state).toMatchObject({
      status: 'starting',
      jobId: null,
      profile: 'quick',
      startedAtMs: 1_000,
    });
    expect(canStart(state)).toBe(false);
  });

  it('ignores a second start while a job is in flight', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 0 });
    state = scanReducer(state, { type: 'progress', progress: running() });
    const next = scanReducer(state, { type: 'start', profile: 'full', at: 10 });
    expect(next.jobId).toBe('job_fixture1');
    expect(next.profile).toBe('quick');
  });

  it('adopts the engine-assigned job id from the first progress event', () => {
    const state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 0 });
    expect(state.jobId).toBeNull();
    const next = scanReducer(state, { type: 'progress', progress: running() });
    expect(next.jobId).toBe('job_fixture1');
  });

  it('applies progress events', () => {
    const state = scanReducer(initialScanState, { type: 'start', profile: 'full', at: 0 });
    const next = scanReducer(state, { type: 'progress', progress: running({ scannedFiles: 42 }) });
    expect(next.status).toBe('running');
    expect(next.progress?.scannedFiles).toBe(42);
  });

  it('ignores progress events from a different job', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'full', at: 0 });
    state = scanReducer(state, { type: 'progress', progress: running() });
    const next = scanReducer(state, { type: 'progress', progress: running({ jobId: 'job_other' }) });
    expect(next.jobId).toBe('job_fixture1');
    expect(next.progress?.jobId).toBe('job_fixture1');
  });

  it('ignores progress after a terminal state', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'full', at: 0 });
    state = scanReducer(state, { type: 'progress', progress: running() });
    state = scanReducer(state, { type: 'completed', progress: progressFixture({ status: 'completed' }) });
    const next = scanReducer(state, { type: 'progress', progress: running({ scannedFiles: 99 }) });
    expect(next.status).toBe('completed');
    expect(next.progress?.scannedFiles).not.toBe(99);
  });

  it('supports cancellation: running -> cancelling -> cancelled', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 0 });
    state = scanReducer(state, { type: 'progress', progress: running() });
    expect(canCancel(state)).toBe(true);

    state = scanReducer(state, { type: 'cancel_requested' });
    expect(state.status).toBe('cancelling');
    expect(canCancel(state)).toBe(false);

    state = scanReducer(state, { type: 'cancelled', progress: progressFixture({ status: 'cancelled' }) });
    expect(state.status).toBe('cancelled');
    expect(isTerminal(state.status)).toBe(true);
  });

  it('refuses a cancel request when nothing is running', () => {
    const state = scanReducer(initialScanState, { type: 'cancel_requested' });
    expect(state.status).toBe('idle');
  });

  it('records failures with the engine error', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 0 });
    state = scanReducer(state, { type: 'progress', progress: running() });
    state = scanReducer(state, { type: 'failed', error });
    expect(state.status).toBe('failed');
    expect(state.error?.message).toBe('Engine crashed.');
    expect(isTerminal(state.status)).toBe(true);
  });

  it('fails a start without leaving a job id behind', () => {
    const state = scanReducer(initialScanState, { type: 'start_failed', error });
    expect(state.status).toBe('failed');
    expect(state.jobId).toBeNull();
  });

  it('marks the job unavailable when no engine is configured', () => {
    const state = scanReducer(initialScanState, {
      type: 'unavailable',
      error: { code: 'not_configured', message: 'Scanner not configured.', hint: null, traceId: null },
    });
    expect(state.status).toBe('unavailable');
    expect(isTerminal(state.status)).toBe(true);
  });

  it('resets back to the initial state', () => {
    let state = scanReducer(initialScanState, { type: 'start', profile: 'quick', at: 0 });
    state = scanReducer(state, { type: 'reset' });
    expect(state).toEqual(initialScanState);
  });
});

describe('helpers', () => {
  it('classifies busy and terminal states', () => {
    expect(isBusy('starting')).toBe(true);
    expect(isBusy('running')).toBe(true);
    expect(isBusy('cancelling')).toBe(true);
    expect(isBusy('completed')).toBe(false);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('idle')).toBe(false);
  });

  it('computes elapsed time from the wall clock while running', () => {
    const state: ScanUiState = { ...initialScanState, status: 'running', startedAtMs: 1_000 };
    expect(elapsedMs(state, 4_500)).toBe(3_500);
  });

  it('prefers engine-reported elapsed time once finished', () => {
    const state: ScanUiState = {
      ...initialScanState,
      status: 'completed',
      startedAtMs: 1_000,
      progress: progressFixture({ elapsedMs: 1_234 }),
    };
    expect(elapsedMs(state, 99_999)).toBe(1_234);
  });

  it('returns indeterminate progress when the total is unknown', () => {
    expect(progressPercent(null)).toBeNull();
    expect(progressPercent(progressFixture({ totalFiles: null }))).toBeNull();
    expect(progressPercent(progressFixture({ scannedFiles: 0, totalFiles: 0 }))).toBeNull();
  });

  it('clamps progress percentages to 0-100', () => {
    expect(progressPercent(progressFixture({ scannedFiles: 5, totalFiles: 10 }))).toBe(50);
    expect(progressPercent(progressFixture({ scannedFiles: 50, totalFiles: 10 }))).toBe(100);
  });
});
