import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RulePack, RulePackUpdateInfo } from '@shared/rule-pack';

function runCli(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

export interface PublishOptions {
  pack: RulePack;
  outDir: string;
  repo?: string;
  releaseTag?: string;
  dryRun?: boolean;
  releaseAssetUrlBase?: string;
}

export async function publishRulePack(opts: PublishOptions): Promise<{ packPath: string; manifestPath: string; updateInfo: RulePackUpdateInfo }> {
  fs.mkdirSync(opts.outDir, { recursive: true });
  const packFile = `vibeops-pack-${opts.pack.manifest.packVersion}.json`;
  const packPath = path.join(opts.outDir, packFile);
  const packBody = JSON.stringify(opts.pack, null, 2);
  fs.writeFileSync(packPath, packBody, 'utf8');

  const sha256 = createHash('sha256').update(packBody).digest('hex');

  const tag = opts.releaseTag ?? `rule-pack-${opts.pack.manifest.packVersion}`;
  const repo = opts.repo ?? process.env.GITHUB_REPOSITORY;
  const assetBase = opts.releaseAssetUrlBase
    ?? (repo ? `https://github.com/${repo}/releases/download/${tag}` : '');

  const updateInfo: RulePackUpdateInfo = {
    packId: opts.pack.manifest.packId,
    packVersion: opts.pack.manifest.packVersion,
    publishedAt: opts.pack.manifest.publishedAt,
    url: assetBase ? `${assetBase}/${packFile}` : packFile,
    signature: opts.pack.manifest.signature ?? '',
    sha256,
    ruleCount: opts.pack.manifest.ruleCount,
    description: opts.pack.manifest.description ?? ''
  };
  if (!opts.pack.manifest.description) delete (updateInfo as Partial<RulePackUpdateInfo>).description;
  const manifestPath = path.join(opts.outDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(updateInfo, null, 2), 'utf8');

  if (opts.dryRun) {
    console.log(`[dry-run] would publish ${packPath} + ${manifestPath} as release ${tag} on ${repo ?? '<no repo>'}`);
    return { packPath, manifestPath, updateInfo };
  }
  if (!repo) throw new Error('publishRulePack: GITHUB_REPOSITORY (or opts.repo) required for non-dry-run publish');

  const { code: viewCode } = await runCli('gh', ['release', 'view', tag, '--repo', repo]);
  if (viewCode !== 0) {
    const create = await runCli('gh', [
      'release', 'create', tag,
      '--repo', repo,
      '--title', `Rule pack ${opts.pack.manifest.packVersion}`,
      '--notes', `Automated rule-pack publish. ${opts.pack.manifest.ruleCount} rules.`
    ]);
    if (create.code !== 0) throw new Error(`gh release create failed: ${create.stderr}`);
  }

  const upload = await runCli('gh', [
    'release', 'upload', tag,
    packPath, manifestPath,
    '--repo', repo,
    '--clobber'
  ]);
  if (upload.code !== 0) throw new Error(`gh release upload failed: ${upload.stderr}`);

  const latestTag = 'rule-pack-latest';
  const { code: latestExists } = await runCli('gh', ['release', 'view', latestTag, '--repo', repo]);
  if (latestExists !== 0) {
    await runCli('gh', [
      'release', 'create', latestTag,
      '--repo', repo,
      '--title', 'Rule pack — latest pointer',
      '--notes', 'Always-overwritten manifest pointing to the most recent rule pack.'
    ]);
  }
  await runCli('gh', ['release', 'upload', latestTag, manifestPath, '--repo', repo, '--clobber']);

  return { packPath, manifestPath, updateInfo };
}
