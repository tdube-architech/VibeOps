import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readMarker,
  writeMarker,
  targetTag,
  shouldRebuild,
  runMain
} from '../../scripts/rebuild-sqlite.mjs';
import { electronBuilder, nodeBuilder, runBuilder } from '../../scripts/rebuild-sqlite.mjs';

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

describe('runMain', () => {
  it('parseRuntime throws on missing arg', async () => {
    await expect(runMain({ argv: [], builders: {} })).rejects.toThrow(/missing --runtime/);
  });

  it('skips rebuild when marker matches target', async () => {
    const calls: string[] = [];
    const markerFile = path.join(tmp, 'marker');
    writeMarker(markerFile, 'electron-v130');
    await runMain({
      argv: ['--runtime=electron'],
      markerPath: markerFile,
      builders: {
        electron: () => { calls.push('electron'); },
        node: () => { calls.push('node'); }
      }
    });
    expect(calls).toEqual([]);
  });

  it('invokes electron builder and writes marker when missing', async () => {
    const calls: string[] = [];
    const markerFile = path.join(tmp, 'marker');
    await runMain({
      argv: ['--runtime=electron'],
      markerPath: markerFile,
      builders: {
        electron: () => { calls.push('electron'); },
        node: () => { calls.push('node'); }
      }
    });
    expect(calls).toEqual(['electron']);
    expect(readMarker(markerFile)).toBe('electron-v130');
  });

  it('invokes node builder and writes node marker on mismatch', async () => {
    const calls: string[] = [];
    const markerFile = path.join(tmp, 'marker');
    writeMarker(markerFile, 'electron-v130');
    await runMain({
      argv: ['--runtime=node'],
      markerPath: markerFile,
      builders: {
        electron: () => { calls.push('electron'); },
        node: () => { calls.push('node'); }
      }
    });
    expect(calls).toEqual(['node']);
    expect(readMarker(markerFile)).toBe(`node-v${process.versions.modules}`);
  });

  it('does not write marker when builder throws', async () => {
    const markerFile = path.join(tmp, 'marker');
    await expect(runMain({
      argv: ['--runtime=electron'],
      markerPath: markerFile,
      builders: {
        electron: () => { throw new Error('boom'); },
        node: () => {}
      }
    })).rejects.toThrow(/boom/);
    expect(readMarker(markerFile)).toBeNull();
  });
});

describe('builders', () => {
  it('runBuilder throws on non-zero exit', () => {
    const fake = (cmd: string, args: string[]) => ({ status: 7, signal: null, error: null, stdout: '', stderr: '', pid: 0, output: [] });
    expect(() => runBuilder('node', ['--bad'], fake as never)).toThrow(/exit 7/);
  });

  it('runBuilder returns when exit zero', () => {
    const fake = () => ({ status: 0, signal: null, error: null, stdout: '', stderr: '', pid: 0, output: [] });
    expect(() => runBuilder('node', ['--ok'], fake as never)).not.toThrow();
  });

  it('runBuilder rethrows spawn error', () => {
    const fake = () => ({ status: null, signal: null, error: new Error('ENOENT'), stdout: '', stderr: '', pid: 0, output: [] });
    expect(() => runBuilder('cmd', [], fake as never)).toThrow(/ENOENT/);
  });
});
