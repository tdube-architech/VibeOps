export const RELATIVE_TIME_THRESHOLDS = {
  justNowMs: 60_000,
  minuteMs: 60_000,
  hourMs: 60 * 60_000,
  dayMs: 24 * 60 * 60_000,
  monthMs: 30 * 24 * 60 * 60_000,
  yearMs: 365 * 24 * 60 * 60_000
} as const;

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Date.now() - t;
  if (ms < RELATIVE_TIME_THRESHOLDS.justNowMs) return 'just now';
  if (ms < RELATIVE_TIME_THRESHOLDS.hourMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.minuteMs), 'minute');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.dayMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.hourMs), 'hour');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.monthMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.dayMs), 'day');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.yearMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.monthMs), 'month');
  }
  return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.yearMs), 'year');
}
