/** Minimal async resource model used across the app (loading / ready / error). */

import type { NativeError } from '@/types/models';

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AsyncResource<T> {
  status: AsyncStatus;
  data: T | null;
  error: NativeError | null;
  /** ISO timestamp of the last successful load. */
  loadedAt: string | null;
}

export function idleResource<T>(): AsyncResource<T> {
  return { status: 'idle', data: null, error: null, loadedAt: null };
}

export function loadingResource<T>(previous: AsyncResource<T> | null = null): AsyncResource<T> {
  return {
    status: 'loading',
    data: previous?.data ?? null,
    error: null,
    loadedAt: previous?.loadedAt ?? null,
  };
}

export function readyResource<T>(data: T): AsyncResource<T> {
  return { status: 'ready', data, error: null, loadedAt: new Date().toISOString() };
}

export function errorResource<T>(error: NativeError, previous: AsyncResource<T> | null = null): AsyncResource<T> {
  return {
    status: 'error',
    data: previous?.data ?? null,
    error,
    loadedAt: previous?.loadedAt ?? null,
  };
}

/** True while a first load is in flight (used for skeletons). */
export function isInitialLoad<T>(resource: AsyncResource<T>): boolean {
  return resource.status === 'loading' && resource.data === null;
}
