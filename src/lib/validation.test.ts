import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  validateJobId,
  validateQuarantineId,
  validateRange,
  validateScanPath,
  validateScanProfile,
} from '@/lib/validation';

describe('validateScanPath', () => {
  it('accepts absolute POSIX paths', () => {
    expect(validateScanPath('/home/tester/Documents')).toMatchObject({ ok: true });
  });

  it('rejects NUL bytes (C-string truncation bypass)', () => {
    const result = validateScanPath('/home/tester\u0000evil.txt');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('null_byte');
  });

  it('rejects characters that are illegal in Windows paths', () => {
    expect(validateScanPath('/home/tester/*.txt').ok).toBe(false);
    expect(validateScanPath('/home/tester/a|b').ok).toBe(false);
  });

  it('rejects paths longer than the maximum', () => {
    const long = `/${'a'.repeat(33_000)}`;
    expect(validateScanPath(long)).toMatchObject({ ok: false, code: 'too_long' });
  });

  it('is not fooled by a path that merely contains "..", even when absolute', () => {
    // ".." is rejected as a policy, not resolved away.
    expect(validateScanPath('/var/../etc').code).toBe('traversal');
  });
});

describe('validateScanProfile', () => {
  it('accepts the three supported profiles', () => {
    expect(validateScanProfile('quick').ok).toBe(true);
    expect(validateScanProfile('full').ok).toBe(true);
    expect(validateScanProfile('custom').ok).toBe(true);
  });

  it('rejects anything else', () => {
    expect(validateScanProfile('deep').ok).toBe(false);
    expect(validateScanProfile(undefined).ok).toBe(false);
    expect(validateScanProfile({ profile: 'quick' }).ok).toBe(false);
  });
});

describe('identifier validation', () => {
  it('accepts well-formed quarantine ids', () => {
    expect(validateQuarantineId('qtn_9fA2bC3d').ok).toBe(true);
  });

  it('rejects traversal and malformed quarantine ids', () => {
    expect(validateQuarantineId('../../etc/passwd').ok).toBe(false);
    expect(validateQuarantineId('qtn_').ok).toBe(false);
    expect(validateQuarantineId('').ok).toBe(false);
  });

  it('accepts well-formed job ids only', () => {
    expect(validateJobId('job_abc123').ok).toBe(true);
    expect(validateJobId('job_').ok).toBe(false);
    expect(validateJobId('../../job').ok).toBe(false);
  });
});

describe('validateRange', () => {
  it('accepts values inside the range', () => {
    expect(validateRange(LIMITS.maxFileSizeMb.min, LIMITS.maxFileSizeMb.min, LIMITS.maxFileSizeMb.max).ok).toBe(true);
    expect(validateRange(LIMITS.maxFileSizeMb.max, LIMITS.maxFileSizeMb.min, LIMITS.maxFileSizeMb.max).ok).toBe(true);
  });

  it('rejects out-of-range and non-numeric values', () => {
    expect(validateRange(0, 1, 4096).ok).toBe(false);
    expect(validateRange(9999, 1, 4096).ok).toBe(false);
    expect(validateRange(Number.NaN, 1, 4096).ok).toBe(false);
    expect(validateRange(Number.POSITIVE_INFINITY, 1, 4096).ok).toBe(false);
  });
});
