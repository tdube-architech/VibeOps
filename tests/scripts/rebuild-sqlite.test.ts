import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readMarker,
  writeMarker,
  targetTag,
  shouldRebuild
} from '../../scripts/rebuild-sqlite.mjs';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-swap-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('marker helpers', () => {
  it('readMarker returns null when file missing', () => {
    expect(readMarker(path.join(tmp, 'missing'))).toBeNull();
  });

  it('writeMarker then readMarker round-trips the tag', () => {
    const file = path.join(tmp, 'marker');
    writeMarker(file, 'electron-v130');
    expect(readMarker(file)).toBe('electron-v130');
  });

  it('targetTag for node uses process.versions.modules', () => {
    expect(targetTag('node')).toBe(`node-v${process.versions.modules}`);
  });

  it('targetTag for electron is pinned to electron-v130', () => {
    expect(targetTag('electron')).toBe('electron-v130');
  });

  it('targetTag throws on unknown runtime', () => {
    expect(() => targetTag('bun' as never)).toThrow(/unknown runtime/);
  });

  it('shouldRebuild true when marker missing', () => {
    expect(shouldRebuild(null, 'electron-v130')).toBe(true);
  });

  it('shouldRebuild false when marker matches target', () => {
    expect(shouldRebuild('electron-v130', 'electron-v130')).toBe(false);
  });

  it('shouldRebuild true when marker differs from target', () => {
    expect(shouldRebuild('node-v137', 'electron-v130')).toBe(true);
  });
});
