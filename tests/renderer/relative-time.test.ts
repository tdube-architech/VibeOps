import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { relativeTime, RELATIVE_TIME_THRESHOLDS } from '../../src/renderer/lib/relative-time';

const NOW = Date.parse('2026-05-11T15:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

describe('relativeTime', () => {
  it('returns "—" for null', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(relativeTime(undefined)).toBe('—');
  });

  it('returns "—" for invalid ISO', () => {
    expect(relativeTime('not a date')).toBe('—');
  });

  it('returns "just now" for ages under 60 seconds', () => {
    expect(relativeTime(iso(0))).toBe('just now');
    expect(relativeTime(iso(30_000))).toBe('just now');
    expect(relativeTime(iso(59_000))).toBe('just now');
  });

  it('returns "just now" for future timestamps (clock skew)', () => {
    expect(relativeTime(iso(-60_000))).toBe('just now');
  });

  it('renders minutes when age is 1m–59m', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.minuteMs))).toMatch(/^2 minutes ago$/);
    expect(relativeTime(iso(59 * RELATIVE_TIME_THRESHOLDS.minuteMs))).toMatch(/^59 minutes ago$/);
  });

  it('renders hours when age is 1h–23h', () => {
    expect(relativeTime(iso(3 * RELATIVE_TIME_THRESHOLDS.hourMs))).toMatch(/^3 hours ago$/);
    expect(relativeTime(iso(23 * RELATIVE_TIME_THRESHOLDS.hourMs))).toMatch(/^23 hours ago$/);
  });

  it('renders days when age is 1d–29d', () => {
    expect(relativeTime(iso(5 * RELATIVE_TIME_THRESHOLDS.dayMs))).toMatch(/^5 days ago$/);
    expect(relativeTime(iso(29 * RELATIVE_TIME_THRESHOLDS.dayMs))).toMatch(/^29 days ago$/);
  });

  it('renders months when age is 1mo–11mo', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.monthMs))).toMatch(/^2 months ago$/);
  });

  it('renders years when age >= 12mo', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.yearMs))).toMatch(/^2 years ago$/);
  });
});
