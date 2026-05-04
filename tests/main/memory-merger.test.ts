import { describe, it, expect } from 'vitest';
import { mergeUserEditableBlocks, extractSectionBodies } from '@main/memory/merger';

const fresh = `# Project Memory: A

<!-- vibeops:section:summary -->
## 2. Product Summary

<!-- vibeops:user-editable -->
Add a short plain-English description.
<!-- /vibeops:user-editable -->
<!-- /vibeops:section:summary -->

<!-- vibeops:section:stack -->
## 4. Current Stack

- Frontend: Next.js
<!-- /vibeops:section:stack -->
`;

const existing = `# Project Memory: A

<!-- vibeops:section:summary -->
## 2. Product Summary

<!-- vibeops:user-editable -->
This app books appointments for plumbers.

It launched in March 2026 for two pilot customers.
<!-- /vibeops:user-editable -->
<!-- /vibeops:section:summary -->

<!-- vibeops:section:stack -->
## 4. Current Stack

- Frontend: ANCIENT JQUERY
<!-- /vibeops:section:stack -->
`;

describe('extractSectionBodies', () => {
  it('returns map of section id to body', () => {
    const map = extractSectionBodies(existing);
    expect(map.has('summary')).toBe(true);
    expect(map.get('summary')).toContain('books appointments for plumbers');
    expect(map.has('stack')).toBe(true);
  });
  it('returns empty map for content without anchors', () => {
    expect(extractSectionBodies('# just a title').size).toBe(0);
  });
});

describe('mergeUserEditableBlocks', () => {
  it('preserves user-editable content but updates non-editable', () => {
    const merged = mergeUserEditableBlocks(fresh, existing);
    expect(merged).toContain('books appointments for plumbers');
    expect(merged).not.toContain('Add a short plain-English description.');
    expect(merged).toContain('Frontend: Next.js');
    expect(merged).not.toContain('ANCIENT JQUERY');
  });
  it('returns the fresh content unchanged when existing is empty', () => {
    expect(mergeUserEditableBlocks(fresh, '')).toBe(fresh);
  });
  it('survives sections that exist in fresh but not existing', () => {
    const reduced = `# Project Memory: A

<!-- vibeops:section:stack -->
## 4. Current Stack
- Frontend: Vite
<!-- /vibeops:section:stack -->
`;
    const merged = mergeUserEditableBlocks(fresh, reduced);
    expect(merged).toContain('Add a short plain-English description.');
    expect(merged).toContain('Frontend: Next.js');
  });
});
