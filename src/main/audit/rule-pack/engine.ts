import type {
  Matcher,
  RegexContentMatcher,
  PackageVersionMatcher,
  RulePack,
  RulePackRule
} from '@shared/rule-pack';
import type { Scan, ScanFile, ScanEnvVar, FileType } from '@shared/types';
import type { DraftFinding } from '../findings';
import { satisfiesRange } from './semver';

export interface EngineContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
  hasFile: (relPath: string) => boolean;
}

const MAX_REGEX_BYTES = 256 * 1024;

const SCOPE_TO_TYPES: Record<string, FileType[]> = {
  source: ['source'],
  config: ['config'],
  'env-secret': ['env-secret'],
  'env-example': ['env-example'],
  lock: ['lock'],
  doc: ['doc']
};

function applies(rule: RulePackRule, scan: Scan): boolean {
  if (rule.enabled === false) return false;
  const filter = rule.appliesTo;
  if (!filter) return true;
  if (filter.frameworks?.length) {
    const have = scan.detection.frameworks.map((f) => f.toLowerCase());
    const want = filter.frameworks.map((f) => f.toLowerCase());
    if (!want.some((w) => have.includes(w))) return false;
  }
  if (filter.primaryStack?.length) {
    const have = (scan.detection.primaryStack ?? '').toLowerCase();
    if (!filter.primaryStack.some((s) => have.includes(s.toLowerCase()))) return false;
  }
  return true;
}

function buildRegex(matcher: RegexContentMatcher): RegExp | null {
  try {
    return new RegExp(matcher.pattern, matcher.flags ?? '');
  } catch {
    return null;
  }
}

function lineNumberFor(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function runRegexContent(rule: RulePackRule, m: RegexContentMatcher, ctx: EngineContext): DraftFinding[] {
  const re = buildRegex(m);
  if (!re) return [];
  const limit = m.maxBytesPerFile ?? MAX_REGEX_BYTES;
  const allowedTypes = m.scope && m.scope !== 'all' ? SCOPE_TO_TYPES[m.scope] ?? null : null;
  const include = m.pathInclude ? new RegExp(m.pathInclude) : null;
  const exclude = m.pathExclude ? new RegExp(m.pathExclude) : null;

  const out: DraftFinding[] = [];
  for (const f of ctx.files) {
    if (allowedTypes && !allowedTypes.includes(f.fileType)) continue;
    if (include && !include.test(f.path)) continue;
    if (exclude && exclude.test(f.path)) continue;
    if (f.sizeBytes > limit) continue;
    const text = ctx.readText(f.path);
    if (!text) continue;
    const found = text.match(re);
    if (!found || found.index === undefined) continue;
    const lineStart = lineNumberFor(text, found.index);
    out.push({
      severity: rule.severity,
      category: rule.category,
      title: `${rule.title} (${f.path})`,
      description: rule.description,
      filePath: f.path,
      lineStart,
      recommendation: rule.recommendation
    });
  }
  return out;
}

function runFileExists(rule: RulePackRule, path: string, ctx: EngineContext): DraftFinding[] {
  if (!ctx.hasFile(path)) return [];
  return [{
    severity: rule.severity,
    category: rule.category,
    title: rule.title,
    description: rule.description,
    filePath: path,
    recommendation: rule.recommendation
  }];
}

function runFileMissing(rule: RulePackRule, path: string, requireSibling: string | undefined, ctx: EngineContext): DraftFinding[] {
  if (requireSibling && !ctx.hasFile(requireSibling)) return [];
  if (ctx.hasFile(path)) return [];
  return [{
    severity: rule.severity,
    category: rule.category,
    title: rule.title,
    description: rule.description,
    recommendation: rule.recommendation
  }];
}

function runPackageVersion(rule: RulePackRule, m: PackageVersionMatcher, ctx: EngineContext): DraftFinding[] {
  if (m.ecosystem !== 'npm') return [];
  const text = ctx.readText('package.json');
  if (!text) return [];
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try { pkg = JSON.parse(text); } catch { return []; }
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const installed = all[m.packageName];
  if (!installed) return [];
  if (!satisfiesRange(installed, m.vulnerableRange)) return [];
  const cveSuffix = rule.cve?.length ? ` (${rule.cve.join(', ')})` : '';
  return [{
    severity: rule.severity,
    category: rule.category,
    title: `${rule.title}: ${m.packageName}@${installed}${cveSuffix}`,
    description: rule.description,
    filePath: 'package.json',
    recommendation: rule.recommendation
  }];
}

function runEnvVarName(rule: RulePackRule, pattern: string, flags: string | undefined, ctx: EngineContext): DraftFinding[] {
  let re: RegExp;
  try { re = new RegExp(pattern, flags ?? ''); } catch { return []; }
  const out: DraftFinding[] = [];
  for (const v of ctx.envVars) {
    if (re.test(v.variable)) {
      out.push({
        severity: rule.severity,
        category: rule.category,
        title: `${rule.title}: ${v.variable}`,
        description: rule.description,
        filePath: v.filename,
        recommendation: rule.recommendation
      });
    }
  }
  return out;
}

function getJsonByPath(value: unknown, jsonPath: string): unknown {
  const parts = jsonPath.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function runJsonPathEquals(
  rule: RulePackRule,
  filePath: string,
  jsonPath: string,
  expected: string | number | boolean | null,
  invert: boolean | undefined,
  ctx: EngineContext
): DraftFinding[] {
  const text = ctx.readText(filePath);
  if (!text) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return []; }
  const actual = getJsonByPath(parsed, jsonPath);
  const eq = actual === expected;
  const triggered = invert ? !eq : eq;
  if (!triggered) return [];
  return [{
    severity: rule.severity,
    category: rule.category,
    title: rule.title,
    description: rule.description,
    filePath,
    recommendation: rule.recommendation
  }];
}

function runMatcher(rule: RulePackRule, m: Matcher, ctx: EngineContext): DraftFinding[] {
  switch (m.kind) {
    case 'regex-content': return runRegexContent(rule, m, ctx);
    case 'file-exists': return runFileExists(rule, m.path, ctx);
    case 'file-missing': return runFileMissing(rule, m.path, m.requireSibling, ctx);
    case 'package-version': return runPackageVersion(rule, m, ctx);
    case 'env-var-name': return runEnvVarName(rule, m.pattern, m.flags, ctx);
    case 'json-path-equals': return runJsonPathEquals(rule, m.filePath, m.jsonPath, m.expected, m.invert, ctx);
  }
}

export interface RuleEngineResult {
  packId: string;
  packVersion: string;
  rulesEvaluated: number;
  rulesMatched: number;
  findings: DraftFinding[];
}

export function runRulePack(pack: RulePack, ctx: EngineContext): RuleEngineResult {
  const findings: DraftFinding[] = [];
  let evaluated = 0;
  let matched = 0;
  for (const rule of pack.rules) {
    if (!applies(rule, ctx.scan)) continue;
    evaluated++;
    const out = runMatcher(rule, rule.matcher, ctx);
    if (out.length) {
      matched++;
      findings.push(...out);
    }
  }
  return {
    packId: pack.manifest.packId,
    packVersion: pack.manifest.packVersion,
    rulesEvaluated: evaluated,
    rulesMatched: matched,
    findings
  };
}
