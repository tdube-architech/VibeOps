import type { RulePackRule } from '@shared/rule-pack';
import type { FindingCategory, FindingSeverity } from '@shared/types';

interface OsvAffectedRange {
  type: 'SEMVER' | 'ECOSYSTEM' | 'GIT';
  events: Array<{ introduced?: string; fixed?: string; last_affected?: string }>;
}

interface OsvAffected {
  package: { ecosystem: string; name: string };
  ranges?: OsvAffectedRange[];
}

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  affected?: OsvAffected[];
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
}

const POPULAR_NPM = [
  'axios', 'next', 'react', 'react-dom', 'express', 'fastify', 'koa', 'hapi',
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'argon2', 'lodash', 'underscore',
  'moment', 'dayjs', 'luxon', 'tar', 'minimist', 'yargs', 'commander',
  'mongoose', 'sequelize', 'pg', 'mysql2', 'sqlite3', 'redis', 'ioredis',
  'socket.io', 'ws', 'cors', 'helmet', 'passport', 'multer', 'formidable',
  'xml2js', 'fast-xml-parser', 'js-yaml', 'yaml', 'markdown-it',
  'sharp', 'jimp', 'puppeteer', 'playwright', 'cheerio', 'jsdom',
  'webpack', 'vite', 'esbuild', 'rollup', 'parcel',
  'nodemailer', 'aws-sdk', '@aws-sdk/client-s3',
  'graphql', 'apollo-server', 'prisma', '@prisma/client',
  'next-auth', 'firebase', 'firebase-admin', 'stripe',
  'tailwindcss', 'postcss', 'autoprefixer'
];

function parseCvssScore(scoreString: string): number {
  const cvssMatch = scoreString.match(/CVSS:\s*([0-9.]+)/);
  if (cvssMatch?.[1]) return parseFloat(cvssMatch[1]);
  const plainMatch = scoreString.match(/^([0-9.]+)$/);
  if (plainMatch?.[1]) return parseFloat(plainMatch[1]);
  return 0;
}

function pickSeverity(vuln: OsvVuln): FindingSeverity {
  const ghsa = vuln.database_specific?.severity?.toUpperCase();
  if (ghsa === 'CRITICAL') return 'critical';
  if (ghsa === 'HIGH') return 'high';
  if (ghsa === 'MODERATE' || ghsa === 'MEDIUM') return 'medium';
  if (ghsa === 'LOW') return 'low';
  const cvss = vuln.severity?.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4');
  if (cvss) {
    const score = parseCvssScore(cvss.score);
    if (score >= 9.0) return 'critical';
    if (score >= 7.0) return 'high';
    if (score >= 4.0) return 'medium';
    if (score > 0) return 'low';
  }
  return 'medium';
}

function buildVulnerableRange(ranges: OsvAffectedRange[] | undefined): string | null {
  if (!ranges) return null;
  for (const r of ranges) {
    if (r.type !== 'SEMVER' && r.type !== 'ECOSYSTEM') continue;
    const intro = r.events.find((e) => e.introduced)?.introduced;
    const fixed = r.events.find((e) => e.fixed)?.fixed;
    const last = r.events.find((e) => e.last_affected)?.last_affected;
    const parts: string[] = [];
    if (intro && intro !== '0') parts.push(`>=${intro}`);
    if (fixed) parts.push(`<${fixed}`);
    else if (last) parts.push(`<=${last}`);
    if (parts.length) return parts.join(' ');
  }
  return null;
}

function pickCveAliases(vuln: OsvVuln): string[] {
  const ids = [vuln.id, ...(vuln.aliases ?? [])];
  return ids.filter((i) => i.startsWith('CVE-'));
}

function classify(vuln: OsvVuln): FindingCategory {
  const text = `${vuln.summary ?? ''} ${vuln.details ?? ''}`.toLowerCase();
  if (/xss|sql|injection|csrf|auth|crypt|token|cors|ssrf|prototype/.test(text)) return 'security';
  return 'dependency';
}

function ruleFromVuln(vuln: OsvVuln, packageName: string): RulePackRule | null {
  const range = buildVulnerableRange(vuln.affected?.[0]?.ranges);
  if (!range) return null;
  const severity = pickSeverity(vuln);
  const cves = pickCveAliases(vuln);
  const id = `osv-${packageName.replace(/[^a-z0-9]/gi, '-')}-${vuln.id.toLowerCase()}`;
  const title = `${packageName} vulnerable: ${vuln.summary?.slice(0, 90) ?? vuln.id}`;
  const description = (vuln.summary ?? vuln.details ?? `OSV vulnerability ${vuln.id} affects ${packageName}.`).slice(0, 600);
  const recommendation = `Upgrade ${packageName} to a fixed version. See ${vuln.id} for details.`;

  const rule: RulePackRule = {
    id,
    severity,
    category: classify(vuln),
    title,
    description,
    recommendation,
    matcher: {
      kind: 'package-version',
      ecosystem: 'npm',
      packageName,
      vulnerableRange: range
    }
  };
  if (cves.length) rule.cve = cves;
  return rule;
}

async function queryOsvBatch(packages: string[]): Promise<Map<string, OsvVuln[]>> {
  const queries = packages.map((name) => ({
    package: { name, ecosystem: 'npm' }
  }));
  const res = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries })
  });
  if (!res.ok) throw new Error(`OSV batch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { results: Array<{ vulns?: Array<{ id: string }> }> };

  const ids = new Set<string>();
  data.results.forEach((r) => r.vulns?.forEach((v) => ids.add(v.id)));

  const detailed = await Promise.all(
    [...ids].map(async (id) => {
      const r = await fetch(`https://api.osv.dev/v1/vulns/${id}`);
      if (!r.ok) return null;
      return (await r.json()) as OsvVuln;
    })
  );
  const byId = new Map(detailed.filter((v): v is OsvVuln => v !== null).map((v) => [v.id, v] as const));

  const out = new Map<string, OsvVuln[]>();
  packages.forEach((name, i) => {
    const idsForPkg = data.results[i]?.vulns?.map((v) => v.id) ?? [];
    const vulns = idsForPkg.map((id) => byId.get(id)).filter((v): v is OsvVuln => Boolean(v));
    out.set(name, vulns);
  });
  return out;
}

export interface OsvFetchOptions {
  packages?: string[];
  includeLowSeverity?: boolean;
}

export async function fetchOsvRules(opts: OsvFetchOptions = {}): Promise<RulePackRule[]> {
  const packages = opts.packages ?? POPULAR_NPM;
  const includeLow = opts.includeLowSeverity ?? false;

  const batchSize = 25;
  const aggregate = new Map<string, OsvVuln[]>();
  for (let i = 0; i < packages.length; i += batchSize) {
    const slice = packages.slice(i, i + batchSize);
    const result = await queryOsvBatch(slice);
    for (const [k, v] of result) aggregate.set(k, v);
  }

  const rules: RulePackRule[] = [];
  for (const [pkg, vulns] of aggregate) {
    for (const v of vulns) {
      const rule = ruleFromVuln(v, pkg);
      if (!rule) continue;
      if (!includeLow && (rule.severity === 'low' || rule.severity === 'info')) continue;
      rules.push(rule);
    }
  }
  return rules;
}
