import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RulePack, RulePackRule } from '@shared/rule-pack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadManualSeed(): RulePackRule[] {
  const seedPath = path.resolve(__dirname, '../../../../resources/rule-packs/builtin.json');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Manual seed not found at ${seedPath}`);
  }
  const raw = fs.readFileSync(seedPath, 'utf8');
  const pack = JSON.parse(raw) as RulePack;
  return pack.rules;
}
