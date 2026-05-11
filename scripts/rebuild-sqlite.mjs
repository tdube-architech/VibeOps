// scripts/rebuild-sqlite.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ELECTRON_ABI = 'electron-v130';
const ELECTRON_VERSION = '41.5.0';
const MARKER_PATH = path.resolve('node_modules/.better-sqlite3-abi');

export function readMarker(file = MARKER_PATH) {
  try {
    return fs.readFileSync(file, 'utf8').trim() || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function writeMarker(file, tag) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${tag}\n`, 'utf8');
}

export function targetTag(runtime) {
  if (runtime === 'electron') return ELECTRON_ABI;
  if (runtime === 'node') return `node-v${process.versions.modules}`;
  throw new Error(`unknown runtime: ${runtime}`);
}

export function shouldRebuild(current, target) {
  return current !== target;
}

export function parseRuntime(argv) {
  const arg = argv.find((a) => a.startsWith('--runtime='));
  if (!arg) throw new Error('missing --runtime=node|electron');
  const value = arg.slice('--runtime='.length);
  if (value !== 'node' && value !== 'electron') {
    throw new Error(`unknown runtime: ${value}`);
  }
  return value;
}

// main entry omitted from this task — added in A2
