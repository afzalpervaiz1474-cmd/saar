import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatRelative,
  formatTimestamp,
  titleCase,
  truncateMiddle,
} from '@/lib/format';

describe('formatBytes', () => {
  it('formats byte and kilobyte ranges', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes and above', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('is defensive about missing or invalid values', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
    expect(formatBytes(Number.NaN)).toBe('-');
    expect(formatBytes(-1)).toBe('-');
  });
});

describe('formatDuration', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('returns a dash for unknown durations', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(Number.NaN)).toBe('-');
    expect(formatDuration(-5)).toBe('-');
  });
});

describe('formatTimestamp / formatRelative', () => {
  const iso = '2026-10-10T09:00:00.000Z';

  it('renders a real timestamp', () => {
    const rendered = formatTimestamp(iso);
    expect(rendered).not.toBe('-');
    expect(rendered).toMatch(/2026/);
  });

  it('treats missing or malformed timestamps as unknown', () => {
    expect(formatTimestamp(null)).toBe('-');
    expect(formatTimestamp('not-a-date')).toBe('-');
    expect(formatRelative(null)).toBe('never');
    expect(formatRelative('nonsense')).toBe('never');
  });

  it('describes recent times relatively', () => {
    expect(formatRelative(new Date(Date.now() - 5_000).toISOString(), Date.now())).toMatch(/ago|just now/);
    expect(formatRelative(new Date(Date.now() + 5_000).toISOString(), Date.now())).toMatch(/now|in /);
  });
});

describe('formatNumber / truncateMiddle / titleCase', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567)).toMatch(/1.?234.?567/);
    expect(formatNumber(null)).toBe('-');
  });

  it('keeps the informative tail of long paths', () => {
    const long = `/home/tester/${'a'.repeat(120)}/important-file.dll`;
    const shortened = truncateMiddle(long, 40);
    expect(shortened.length).toBeLessThan(long.length);
    expect(shortened.endsWith('important-file.dll')).toBe(true);
  });

  it('leaves short values untouched', () => {
    expect(truncateMiddle('/tmp/a', 40)).toBe('/tmp/a');
  });

  it('title-cases snake, kebab and spaced identifiers', () => {
    expect(titleCase('scan_started')).toBe('Scan Started');
    expect(titleCase('not-configured')).toBe('Not Configured');
    expect(titleCase('quick')).toBe('Quick');
  });
});
