import { describe, it, expect } from 'vitest';
import { FINDING_TO_PRIORITY } from '../../src/shared/finding-to-task';

describe('FINDING_TO_PRIORITY', () => {
  it('identity-maps actionable severities', () => {
    expect(FINDING_TO_PRIORITY.critical).toBe('critical');
    expect(FINDING_TO_PRIORITY.high).toBe('high');
    expect(FINDING_TO_PRIORITY.medium).toBe('medium');
    expect(FINDING_TO_PRIORITY.low).toBe('low');
  });

  it('returns null for info severity (skip signal)', () => {
    expect(FINDING_TO_PRIORITY.info).toBeNull();
  });
});
