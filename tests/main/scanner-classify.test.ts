import { describe, it, expect } from 'vitest';
import { classifyFile, importanceScore } from '@main/scanner/classify';

describe('classifyFile', () => {
  it('detects source files', () => {
    expect(classifyFile('src/index.ts')).toBe('source');
    expect(classifyFile('app/page.tsx')).toBe('source');
    expect(classifyFile('main.py')).toBe('source');
  });
  it('detects config', () => {
    expect(classifyFile('next.config.js')).toBe('config');
    expect(classifyFile('vite.config.ts')).toBe('config');
    expect(classifyFile('package.json')).toBe('config');
    expect(classifyFile('docker-compose.yml')).toBe('config');
  });
  it('detects locks', () => {
    expect(classifyFile('pnpm-lock.yaml')).toBe('lock');
    expect(classifyFile('package-lock.json')).toBe('lock');
    expect(classifyFile('yarn.lock')).toBe('lock');
  });
  it('detects docs', () => {
    expect(classifyFile('README.md')).toBe('doc');
    expect(classifyFile('docs/architecture.md')).toBe('doc');
    expect(classifyFile('CLAUDE.md')).toBe('doc');
  });
  it('detects env-example vs env-secret', () => {
    expect(classifyFile('.env.example')).toBe('env-example');
    expect(classifyFile('.env.local.example')).toBe('env-example');
    expect(classifyFile('.env')).toBe('env-secret');
    expect(classifyFile('.env.production')).toBe('env-secret');
  });
  it('detects tests', () => {
    expect(classifyFile('tests/foo.test.ts')).toBe('test');
    expect(classifyFile('src/foo.spec.tsx')).toBe('test');
    expect(classifyFile('test_main.py')).toBe('test');
  });
  it('detects assets', () => {
    expect(classifyFile('public/logo.svg')).toBe('asset');
    expect(classifyFile('assets/hero.png')).toBe('asset');
  });
  it('falls back to unknown', () => {
    expect(classifyFile('weirdfile.xyz')).toBe('unknown');
  });
});

describe('importanceScore', () => {
  it('scores top-level package.json highest', () => {
    expect(importanceScore('package.json')).toBeGreaterThan(importanceScore('src/index.ts'));
  });
  it('scores README highly', () => {
    expect(importanceScore('README.md')).toBeGreaterThanOrEqual(80);
  });
  it('scores schema/migrations highly', () => {
    expect(importanceScore('prisma/schema.prisma')).toBeGreaterThanOrEqual(85);
    expect(importanceScore('supabase/migrations/0001_init.sql')).toBeGreaterThanOrEqual(80);
  });
  it('scores deeply nested generated-looking files low', () => {
    expect(importanceScore('src/__generated__/schema.ts')).toBeLessThanOrEqual(20);
  });
});
