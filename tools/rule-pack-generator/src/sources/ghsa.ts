import type { RulePackRule } from '@shared/rule-pack';
import type { FindingSeverity } from '@shared/types';

interface GhsaAdvisory {
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: Array<{
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    first_patched_version: string | null;
  }>;
  cwes?: Array<{ cwe_id: string }>;
  published_at: string;
}

const GHSA_BASE = 'https://api.github.com/advisories';

function severityFromGhsa(s: GhsaAdvisory['severity']): FindingSeverity {
  switch (s) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
  }
}

function rangeFromGhsa(raw: string): string {
  return raw.replace(/,\s*/g, ' ').trim();
}

function ruleFromAdvisory(adv: GhsaAdvisory, vuln: GhsaAdvisory['vulnerabilities'][number]): RulePackRule | null {
  const range = rangeFromGhsa(vuln.vulnerable_version_range);
  if (!range) return null;
  const id = `ghsa-${vuln.package.name.replace(/[^a-z0-9]/gi, '-')}-${adv.ghsa_id.toLowerCase()}`;
  const cves = adv.cve_id ? [adv.cve_id] : [];
  const cwes = adv.cwes?.map((c) => c.cwe_id) ?? [];
  const fixed = vuln.first_patched_version ? ` Fixed in ${vuln.first_patched_version}.` : '';

  const rule: RulePackRule = {
    id,
    severity: severityFromGhsa(adv.severity),
    category: 'dependency',
    title: `${vuln.package.name} vulnerable: ${adv.summary.slice(0, 90)}`,
    description: (adv.description ?? adv.summary).slice(0, 600),
    recommendation: `Upgrade ${vuln.package.name}.${fixed} See ${adv.ghsa_id}.`,
    matcher: {
      kind: 'package-version',
      ecosystem: 'npm',
      packageName: vuln.package.name,
      vulnerableRange: range
    }
  };
  if (cves.length) rule.cve = cves;
  if (cwes.length) rule.cwe = cwes;
  return rule;
}

export interface GhsaFetchOptions {
  ecosystem?: 'npm' | 'pip';
  perPage?: number;
  pages?: number;
  token?: string;
  minSeverity?: FindingSeverity;
}

export async function fetchGhsaRules(opts: GhsaFetchOptions = {}): Promise<RulePackRule[]> {
  const eco = opts.ecosystem ?? 'npm';
  const perPage = opts.perPage ?? 100;
  const pages = opts.pages ?? 3;
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GHSA: GITHUB_TOKEN unset; advisories endpoint is unauthenticated and rate-limited.');
  }

  const minOrder: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const cutoff = minOrder[opts.minSeverity ?? 'medium'] ?? 2;

  const rules: RulePackRule[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `${GHSA_BASE}?ecosystem=${eco}&per_page=${perPage}&page=${page}&sort=published&direction=desc`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`GHSA: page ${page} failed: ${res.status}`);
      break;
    }
    const advisories = (await res.json()) as GhsaAdvisory[];
    if (!advisories.length) break;

    for (const adv of advisories) {
      const sev = severityFromGhsa(adv.severity);
      const sevOrder = minOrder[sev] ?? 4;
      if (sevOrder > cutoff) continue;
      for (const vuln of adv.vulnerabilities) {
        if (vuln.package.ecosystem !== eco) continue;
        const rule = ruleFromAdvisory(adv, vuln);
        if (rule) rules.push(rule);
      }
    }
  }
  return rules;
}
