import fs from 'node:fs';
import path from 'node:path';
import { validatePack } from './validate.js';
import { verifyRulePack } from './sign.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx validate-cli.ts <pack.json> [--pubkey-env VIBEOPS_PACK_PUBLIC_KEY]');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(file), 'utf8');
const pack = JSON.parse(raw);

const issues = validatePack(pack);
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warn');
console.log(`rules: ${pack.rules?.length ?? 0}`);
console.log(`errors: ${errors.length}, warnings: ${warnings.length}`);
for (const e of errors) console.error(`  error[${e.ruleId ?? '-'}]: ${e.message}`);
for (const w of warnings) console.warn(`  warn[${w.ruleId ?? '-'}]: ${w.message}`);

const idx = process.argv.indexOf('--pubkey-env');
if (idx > 0 && process.argv[idx + 1]) {
  const pub = process.env[process.argv[idx + 1]!];
  if (!pub) {
    console.error(`env var ${process.argv[idx + 1]} not set`);
    process.exit(1);
  }
  const ok = verifyRulePack(pack, pub);
  console.log(`signature: ${ok ? 'VALID' : 'INVALID'}`);
  if (!ok) process.exit(1);
}

if (errors.length) process.exit(1);
