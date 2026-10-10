import { describe, expect, it } from 'vitest';
import {
  detectBridgeKind,
  getBridge,
  NativeCommandError,
  toNativeError,
} from '@/lib/native/bridge';
import * as commands from '@/lib/native/commands';
import { APP_VERSION } from '@/lib/constants';

describe('native bridge detection', () => {
  it('reports "unavailable" outside the Tauri shell', () => {
    expect(detectBridgeKind()).toBe('unavailable');
    expect(getBridge().kind).toBe('unavailable');
  });

  it('refuses privileged commands and labels them honestly', async () => {
    await expect(commands.getProtectionStatus()).rejects.toMatchObject({
      code: 'bridge_unavailable',
    });
    await expect(commands.listQuarantine()).rejects.toMatchObject({
      code: 'bridge_unavailable',
    });
    await expect(commands.startScan({ profile: 'quick' })).rejects.toMatchObject({
      code: 'bridge_unavailable',
    });
  });

  it('rejects invalid input before any IPC happens', async () => {
    await expect(commands.startScan({ profile: 'custom', targets: ['../etc'] })).rejects.toMatchObject(
      { code: 'invalid_input' },
    );
    await expect(commands.getScanResults('bad id')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(commands.deleteQuarantineItem('../../root')).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('reports real runtime facts when the shell is absent, without faking protection', async () => {
    const info = await commands.getAppInfo();
    expect(info.version).toBe(APP_VERSION);
    expect(info.buildTarget).toBe('web-preview');
    expect(info.nativeBridge).toBe('unavailable');
    // Platform detection uses the real user agent - it must produce a known family or "unknown".
    expect(typeof info.platform).toBe('string');
    expect(info.platformDetail).toMatch(/browser preview/i);
  });
});

describe('toNativeError', () => {
  it('passes NativeCommandError through unchanged', () => {
    const error = NativeCommandError.unavailable();
    expect(toNativeError(error)).toBe(error);
  });

  it('normalises plain strings', () => {
    expect(toNativeError('engine exploded')).toMatchObject({
      code: 'engine_error',
      message: 'engine exploded',
    });
  });

  it('normalises structured error objects', () => {
    expect(
      toNativeError({ code: 'permission_denied', message: 'Access denied', hint: 'Run as user' }),
    ).toMatchObject({ code: 'permission_denied', hint: 'Run as user' });
  });

  it('normalises Error instances and unknown values', () => {
    expect(toNativeError(new Error('boom'))).toMatchObject({ code: 'internal', message: 'boom' });
    expect(toNativeError(null)).toMatchObject({ code: 'internal' });
    expect(toNativeError(42)).toMatchObject({ code: 'internal' });
  });
});

describe('NativeCommandError', () => {
  it('is an Error carrying the structured fields', () => {
    const error = new NativeCommandError({
      code: 'not_configured',
      message: 'Scanner not configured.',
      hint: 'Install an engine.',
      traceId: 'trace-9',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('not_configured');
    expect(error.hint).toBe('Install an engine.');
    expect(error.traceId).toBe('trace-9');
  });
});
