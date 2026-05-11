// scripts/rebuild-sqlite.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

export async function runMain({ argv, markerPath = MARKER_PATH, builders }) {
  const runtime = parseRuntime(argv);
  const target = targetTag(runtime);
  const current = readMarker(markerPath);
  if (!shouldRebuild(current, target)) {
    console.log(`rebuild-sqlite: skipped (already ${target})`);
    return;
  }
  const builder = builders[runtime];
  if (!builder) throw new Error(`no builder for runtime: ${runtime}`);
  await builder();
  writeMarker(markerPath, target);
  console.log(`rebuild-sqlite: built for ${target}`);
}

export function runBuilder(command, args, spawn = spawnSync) {
  const result = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exit ${result.status}`);
  }
}

export function electronBuilder() {
  runBuilder('npx', ['electron-rebuild', '-v', ELECTRON_VERSION, '--only', 'better-sqlite3', '--force']);
}

export function nodeBuilder() {
  runBuilder('pnpm', ['rebuild', 'better-sqlite3', '--build-from-source'], (cmd, args, opts) =>
    spawnSync(cmd, args, {
      ...opts,
      env: { ...process.env, npm_config_runtime: 'node', npm_config_build_from_source: 'true' }
    })
  );
}

// CLI entry — runs when invoked directly
const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;
if (isMain) {
  try {
    await runMain({
      argv: process.argv.slice(2),
      builders: { electron: electronBuilder, node: nodeBuilder }
    });
  } catch (err) {
    console.error(`rebuild-sqlite: ${err.message}`);
    if (err.message.includes('exit') || err.code === 'ENOENT') {
      console.error('rebuild-sqlite: install platform build tools (Windows: VS Build Tools; macOS: xcode-select --install; Linux: build-essential)');
    }
    process.exit(1);
  }
}
