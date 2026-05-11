import { describe, it, expect } from 'vitest';
import { findingSignature } from '../../src/shared/finding-signature';

describe('findingSignature', () => {
  it('joins category | filePath | lineStart | title', () => {
    expect(findingSignature({
      category: 'security',
      title: 'Hardcoded API key',
      filePath: 'app/page.tsx',
      lineStart: 12
    })).toBe('security|app/page.tsx|12|Hardcoded API key');
  });

  it('falls back to "-" when filePath null and 0 when lineStart null', () => {
    expect(findingSignature({
      category: 'architecture',
      title: 'mixes /app and /pages',
      filePath: null,
      lineStart: null
    })).toBe('architecture|-|0|mixes /app and /pages');
  });

  it('produces identical output for identical inputs (deterministic)', () => {
    const a = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    const b = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    expect(a).toBe(b);
  });

  it('differs when lineStart differs', () => {
    const a = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    const b = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 2 });
    expect(a).not.toBe(b);
  });
});
