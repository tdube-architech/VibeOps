import type { RulePack, RulePackRule, Matcher } from '@shared/rule-pack';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const VALID_CATEGORIES = new Set([
  'architecture', 'security', 'dependency', 'product-completeness',
  'vibe-code-quality', 'deployment', 'documentation'
]);
const VALID_MATCHER_KINDS = new Set([
  'regex-content', 'file-exists', 'file-missing', 'package-version',
  'env-var-name', 'json-path-equals'
]);

export interface ValidationIssue {
  ruleId: string | null;
  level: 'error' | 'warn';
  message: string;
}

const REDOS_BUDGET_MS = 50;
const REDOS_PROBE = 'a'.repeat(2048) + '!';

function benchRegex(pattern: string, flags: string | undefined): number {
  try {
    const re = new RegExp(pattern, flags ?? '');
    const start = Date.now();
    re.test(REDOS_PROBE);
    return Date.now() - start;
  } catch {
    return -1;
  }
}

function validateMatcher(m: Matcher, issues: ValidationIssue[], ruleId: string): void {
  if (!VALID_MATCHER_KINDS.has(m.kind)) {
    issues.push({ ruleId, level: 'error', message: `unknown matcher kind: ${m.kind}` });
    return;
  }
  if (m.kind === 'regex-content' || m.kind === 'env-var-name') {
    const ms = benchRegex(m.pattern, 'flags' in m ? m.flags : undefined);
    if (ms < 0) {
      issues.push({ ruleId, level: 'error', message: `regex does not compile: ${m.pattern}` });
    } else if (ms > REDOS_BUDGET_MS) {
      issues.push({ ruleId, level: 'error', message: `regex too slow (${ms}ms, budget ${REDOS_BUDGET_MS}ms): ${m.pattern}` });
    }
  }
  if (m.kind === 'package-version' && !m.vulnerableRange.trim()) {
    issues.push({ ruleId, level: 'error', message: 'package-version matcher missing vulnerableRange' });
  }
  if (m.kind === 'json-path-equals' && !m.jsonPath) {
    issues.push({ ruleId, level: 'error', message: 'json-path-equals matcher missing jsonPath' });
  }
}

function validateRule(rule: RulePackRule, issues: ValidationIssue[], seenIds: Set<string>): void {
  const id = rule.id ?? '<missing>';
  if (!rule.id) issues.push({ ruleId: null, level: 'error', message: 'rule missing id' });
  if (seenIds.has(id)) issues.push({ ruleId: id, level: 'error', message: 'duplicate rule id' });
  seenIds.add(id);

  if (!VALID_SEVERITIES.has(rule.severity)) issues.push({ ruleId: id, level: 'error', message: `invalid severity: ${rule.severity}` });
  if (!VALID_CATEGORIES.has(rule.category)) issues.push({ ruleId: id, level: 'error', message: `invalid category: ${rule.category}` });
  if (!rule.title?.trim()) issues.push({ ruleId: id, level: 'error', message: 'missing title' });
  if (!rule.description?.trim()) issues.push({ ruleId: id, level: 'warn', message: 'missing description' });
  if (!rule.recommendation?.trim()) issues.push({ ruleId: id, level: 'warn', message: 'missing recommendation' });

  if (rule.matcher) validateMatcher(rule.matcher, issues, id);
  else issues.push({ ruleId: id, level: 'error', message: 'missing matcher' });
}

export function validatePack(pack: RulePack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (pack.manifest?.schemaVersion !== 1) {
    issues.push({ ruleId: null, level: 'error', message: `unsupported schemaVersion: ${pack.manifest?.schemaVersion}` });
  }
  if (!pack.manifest?.packId) issues.push({ ruleId: null, level: 'error', message: 'manifest missing packId' });
  if (!pack.manifest?.packVersion) issues.push({ ruleId: null, level: 'error', message: 'manifest missing packVersion' });

  const seen = new Set<string>();
  for (const rule of pack.rules ?? []) validateRule(rule, issues, seen);

  return issues;
}

export function failOnErrors(issues: ValidationIssue[]): void {
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length === 0) return;
  console.error('Validation failed:');
  for (const e of errors) console.error(`  [${e.ruleId ?? '-'}] ${e.message}`);
  process.exit(1);
}
