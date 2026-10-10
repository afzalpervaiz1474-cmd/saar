/**
 * Native transport.
 *
 * The UI never calls `invoke` directly: everything goes through this module so
 * that (a) there is exactly one place to audit for least-privilege IPC, and
 * (b) running the app in a plain browser (design review, tests, screenshots)
 * produces an explicit *unavailable* state instead of fabricated data.
 */

import type { NativeBridgeKind, NativeError, NativeErrorCode } from '@/types/models';

/** Error thrown for every failed native command. Mirrors `shieldforge_core::Error`. */
export class NativeCommandError extends Error implements NativeError {
  readonly code: NativeErrorCode;
  readonly hint: string | null;
  readonly traceId: string | null;

  constructor(error: NativeError) {
    super(error.message);
    this.name = 'NativeCommandError';
    this.code = error.code;
    this.hint = error.hint;
    this.traceId = error.traceId;
  }

  static unavailable(hint: string | null = null): NativeCommandError {
    return new NativeCommandError({
      code: 'bridge_unavailable',
      message: 'Native security services are not reachable.',
      hint: hint ?? 'Open ShieldForge from the desktop shell (npm run tauri dev).',
      traceId: null,
    });
  }
}

export interface Bridge {
  readonly kind: NativeBridgeKind;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

/**
 * Tauri v2 exposes `window.__TAURI_INTERNALS__`. We deliberately do not sniff
 * user agents: the presence of the real IPC object is the only signal we trust.
 */
export function detectBridgeKind(): NativeBridgeKind {
  if (typeof window === 'undefined') return 'unavailable';
  const w = window as unknown as Record<string, unknown>;
  return '__TAURI_INTERNALS__' in w && w['__TAURI_INTERNALS__'] !== undefined
    ? 'tauri'
    : 'unavailable';
}

const tauriBridge: Bridge = {
  kind: 'tauri',
  async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    // Dynamic import keeps the browser bundle free of Tauri glue unless the
    // shell is actually present.
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  },
};

const unavailableBridge: Bridge = {
  kind: 'unavailable',
  async invoke<T>(_command: string, _args: Record<string, unknown> = {}): Promise<T> {
    throw NativeCommandError.unavailable();
  },
};

export function getBridge(): Bridge {
  return detectBridgeKind() === 'tauri' ? tauriBridge : unavailableBridge;
}

export const bridge: Bridge = getBridge();

/** Normalises anything thrown by IPC into a `NativeCommandError`. */
export function toNativeError(error: unknown): NativeCommandError {
  if (error instanceof NativeCommandError) return error;

  if (typeof error === 'string' && error.length > 0) {
    return new NativeCommandError({
      code: 'engine_error',
      message: error,
      hint: null,
      traceId: null,
    });
  }

  if (error && typeof error === 'object') {
    const maybe = error as Partial<NativeError> & { message?: unknown };
    if (typeof maybe.code === 'string' && typeof maybe.message === 'string') {
      return new NativeCommandError({
        code: maybe.code as NativeErrorCode,
        message: maybe.message,
        hint: typeof maybe.hint === 'string' ? maybe.hint : null,
        traceId: typeof maybe.traceId === 'string' ? maybe.traceId : null,
      });
    }
    if (typeof maybe.message === 'string') {
      return new NativeCommandError({
        code: 'internal',
        message: maybe.message,
        hint: null,
        traceId: null,
      });
    }
  }

  return new NativeCommandError({
    code: 'internal',
    message: 'Unexpected native error.',
    hint: null,
    traceId: null,
  });
}
