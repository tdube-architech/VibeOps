import { describe, it, expect } from 'vitest';
import { slugify, ensureUniqueSlug } from '@shared/slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips diacritics', () => {
    expect(slugify('Café Pâté')).toBe('cafe-pate');
  });
  it('collapses repeated separators', () => {
    expect(slugify('a   b---c')).toBe('a-b-c');
  });
  it('strips leading/trailing dashes', () => {
    expect(slugify('--Hi--')).toBe('hi');
  });
  it('truncates very long names', () => {
    expect(slugify('x'.repeat(120)).length).toBeLessThanOrEqual(64);
  });
  it('returns "project" for empty/punctuation-only input', () => {
    expect(slugify('!!!')).toBe('project');
    expect(slugify('')).toBe('project');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns base slug if not taken', () => {
    expect(ensureUniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2, -3 when taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
    expect(ensureUniqueSlug('foo', new Set(['foo', 'foo-2']))).toBe('foo-3');
  });
});
