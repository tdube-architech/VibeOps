import { describe, it, expect } from 'vitest';
import {
  AUTO_SCAN_COOLDOWN_MS,
  decideAutoScan
} from '../../src/renderer/features/projects/autoScanPolicy';

const PROJ = { id: 'p1', localPath: 'C:\\code\\demo', source: 'local' as const };
const NOW = Date.parse('2026-05-11T12:00:00Z');

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe('decideAutoScan', () => {
  it('triggers when project never scanned', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: null },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('trigger');
    expect(out.reason).toMatch(/never scanned/i);
  });

  it('skips when scanned within cooldown', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: iso(-30_000) },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/cooldown/i);
  });

  it('triggers when older than cooldown', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: iso(-(AUTO_SCAN_COOLDOWN_MS + 1000)) },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('trigger');
    expect(out.reason).toMatch(/stale/i);
  });

  it('skips when same project already attempted in this mount', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: null },
      lastAttemptedId: 'p1',
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/already attempted/i);
  });

  it('triggers after project.id change resets attempt ref', () => {
    const out = decideAutoScan({
      project: { id: 'p2', localPath: 'C:\\code\\two', source: 'local', lastScannedAt: null },
      lastAttemptedId: 'p1',
      now: NOW
    });
    expect(out.action).toBe('trigger');
  });

  it('skips when cloud project has no localPath (read-only collaborator view)', () => {
    const out = decideAutoScan({
      project: { id: 'p3', localPath: '', source: 'cloud', lastScannedAt: null },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/no local path/i);
  });

  it('skips when project undefined', () => {
    const out = decideAutoScan({ project: undefined, lastAttemptedId: null, now: NOW });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/no project/i);
  });
});
