import fs from 'node:fs';
import path from 'node:path';
import type { RulePack, RulePackRule } from '@shared/rule-pack';
import { loadManualSeed } from './seed/manual.js';
import { fetchOsvRules } from './sources/osv.js';
import { fetchGhsaRules } from './sources/ghsa.js';
import { generateAiPatternRules, DEFAULT_AI_TOPICS } from './sources/ai-patterns.js';
import { signRulePack } from './sign.js';
import { validatePack, failOnErrors } from './validate.js';
import { publishRulePack } from './publish.js';

interface Cli {
  dryRun: boolean;
  noAi: boolean;
  noOsv: boolean;
  noGhsa: boolean;
  publish: boolean;
  outDir: string;
  packVersion: string;
  privateKeyEnv: string;
}

function parseArgs(): Cli {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const get = (flag: string, def: string): string => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1]! : def;
  };
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');

  return {
    dryRun: has('--dry-run'),
    noAi: has('--no-ai'),
    noOsv: has('--no-osv'),
    noGhsa: has('--no-ghsa'),
    publish: has('--publish'),
    outDir: get('--out', path.resolve('./packs-out')),
    packVersion: get('--version', `${yyyy}.${mm}.${dd}`),
    privateKeyEnv: get('--key-env', 'VIBEOPS_PACK_PRIVATE_KEY')
  };
}

function dedupeById(rules: RulePackRule[]): RulePackRule[] {
  const seen = new Set<string>();
  const out: RulePackRule[] = [];
  for (const r of rules) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function main(): Promise<void> {
  const cli = parseArgs();
  console.log(`vibeops rule-pack generator — version ${cli.packVersion}`);
  console.log(`flags: dryRun=${cli.dryRun} noAi=${cli.noAi} noOsv=${cli.noOsv} noGhsa=${cli.noGhsa} publish=${cli.publish}`);

  const seed = loadManualSeed();
  console.log(`seed rules: ${seed.length}`);

  let osvRules: RulePackRule[] = [];
  if (!cli.noOsv) {
    try {
      osvRules = await fetchOsvRules({});
      console.log(`OSV rules: ${osvRules.length}`);
    } catch (e) {
      console.warn(`OSV fetch failed: ${(e as Error).message}`);
    }
  }

  let ghsaRules: RulePackRule[] = [];
  if (!cli.noGhsa) {
    try {
      ghsaRules = await fetchGhsaRules({ ecosystem: 'npm', minSeverity: 'medium' });
      console.log(`GHSA rules: ${ghsaRules.length}`);
    } catch (e) {
      console.warn(`GHSA fetch failed: ${(e as Error).message}`);
    }
  }

  let aiRules: RulePackRule[] = [];
  if (!cli.noAi) {
    try {
      const result = await generateAiPatternRules({
        existingRules: [...seed, ...osvRules, ...ghsaRules],
        topics: DEFAULT_AI_TOPICS,
        perTopicCount: 6
      });
      aiRules = result.rules;
      console.log(`AI rules: ${aiRules.length} (warnings: ${result.warnings.length})`);
      if (result.warnings.length) {
        for (const w of result.warnings.slice(0, 10)) console.warn(`  ${w}`);
      }
    } catch (e) {
      console.warn(`AI generation failed: ${(e as Error).message}`);
    }
  }

  const merged = dedupeById([...seed, ...osvRules, ...ghsaRules, ...aiRules]);
  console.log(`merged rules: ${merged.length}`);

  const pack: RulePack = {
    manifest: {
      schemaVersion: 1,
      packId: 'vibeops-pack',
      packVersion: cli.packVersion,
      publishedAt: new Date().toISOString(),
      description: `Auto-generated VibeOps rule pack. Sources: seed(${seed.length}) + OSV(${osvRules.length}) + GHSA(${ghsaRules.length}) + AI(${aiRules.length}).`,
      source: 'remote',
      ruleCount: merged.length
    },
    rules: merged
  };

  const issues = validatePack(pack);
  for (const i of issues.filter((x) => x.level === 'warn')) {
    console.warn(`warn[${i.ruleId ?? '-'}]: ${i.message}`);
  }
  failOnErrors(issues);

  const privateKeyB64 = process.env[cli.privateKeyEnv];
  let signed = pack;
  if (privateKeyB64) {
    signed = signRulePack(pack, privateKeyB64);
    console.log('pack signed.');
  } else {
    console.warn(`${cli.privateKeyEnv} unset — pack will be UNSIGNED. Will not be accepted by clients.`);
  }

  fs.mkdirSync(cli.outDir, { recursive: true });

  if (cli.publish || cli.dryRun) {
    const result = await publishRulePack({
      pack: signed,
      outDir: cli.outDir,
      dryRun: cli.dryRun
    });
    console.log(`pack: ${result.packPath}`);
    console.log(`manifest: ${result.manifestPath}`);
    console.log(`sha256: ${result.updateInfo.sha256}`);
  } else {
    const fname = path.join(cli.outDir, `vibeops-pack-${cli.packVersion}.json`);
    fs.writeFileSync(fname, JSON.stringify(signed, null, 2), 'utf8');
    console.log(`wrote ${fname}`);
  }
}

main().catch((err) => {
  console.error('rule-pack generator failed:', err);
  process.exit(1);
});
