import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { walkProject } from '@main/scanner/walker';

const fixtureRoot = path.resolve('tests/fixtures/scanner/react-vite');

beforeAll(() => {
  const files: Array<[string, string]> = [
    ['package.json', JSON.stringify({ name: 'demo', dependencies: { react: '^18.0.0' }, devDependencies: { vite: '^5.0.0' } })],
    ['vite.config.ts', 'export default {}'],
    ['src/main.tsx', 'console.log("hi")'],
    ['src/components/App.tsx', 'export const App = () => null;'],
    ['README.md', '# demo'],
    ['.env.example', '# example\nAPI_URL=https://example.test\n'],
    ['.env', 'SECRET=do_not_read_me\n'],
    ['node_modules/foo/index.js', '// huge dep'],
    ['dist/main.js', '// build output'],
    ['.gitignore', 'dist\n']
  ];
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const p = path.join(fixtureRoot, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
});

describe('walkProject', () => {
  it('walks the tree honoring default ignores', async () => {
    const result = await walkProject(fixtureRoot);
    const rel = result.files.map((f) => f.relativePath.replace(/\\/g, '/'));
    expect(rel).toContain('package.json');
    expect(rel).toContain('vite.config.ts');
    expect(rel).toContain('src/main.tsx');
    expect(rel).toContain('.env.example');
    expect(rel).not.toContain('.env');
    expect(rel).not.toContain('node_modules/foo/index.js');
    expect(rel).not.toContain('dist/main.js');
  });

  it('records totals', async () => {
    const result = await walkProject(fixtureRoot);
    expect(result.totalFiles).toBe(result.files.length);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('flags secret env file in warnings, but does NOT include it in files', async () => {
    const result = await walkProject(fixtureRoot);
    expect(result.warnings.some((w) => w.code === 'SECRET_FILE_PRESENT')).toBe(true);
    expect(result.files.some((f) => f.relativePath === '.env')).toBe(false);
  });

  it('caps per-file size and reports oversize as warning', async () => {
    const big = path.join(fixtureRoot, 'big-binary.bin');
    fs.writeFileSync(big, Buffer.alloc(60_000_000));
    const result = await walkProject(fixtureRoot);
    const file = result.files.find((f) => f.relativePath === 'big-binary.bin');
    expect(file).toBeDefined();
    expect(file?.skippedReason ?? null).toBe('TOO_LARGE');
    fs.rmSync(big);
  });
});
