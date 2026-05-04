import Anthropic from '@anthropic-ai/sdk';
import type { RulePackRule } from '@shared/rule-pack';
import { validatePack } from '../validate.js';

const SYSTEM_PROMPT = `You are a security researcher building a rule pack for an offline static auditor.
Your job: produce JSON rules that catch SPECIFIC anti-patterns in JavaScript/TypeScript/Python code with HIGH precision and LOW false positives.

OUTPUT FORMAT — return ONLY a JSON array of rule objects, no prose, no markdown.

Each rule MUST have:
- id: kebab-case, prefixed "ai-", globally unique
- severity: "critical" | "high" | "medium" | "low" | "info"
- category: "security" | "vibe-code-quality" | "deployment" | "documentation" | "dependency"
- title: short human-readable
- description: 1-3 sentences explaining the risk
- recommendation: concrete remediation
- cwe: array of CWE ids if applicable, else omit
- matcher: ONE of:
  - { "kind": "regex-content", "pattern": "<JavaScript regex>", "flags": "<optional>", "scope": "source"|"config"|"all", "pathExclude": "<optional regex>" }
  - { "kind": "file-exists", "path": "<relative path>" }
  - { "kind": "file-missing", "path": "<relative path>", "requireSibling": "<optional>" }
  - { "kind": "package-version", "ecosystem": "npm", "packageName": "<name>", "vulnerableRange": "<semver range>" }
  - { "kind": "env-var-name", "pattern": "<JS regex>" }
  - { "kind": "json-path-equals", "filePath": "<path>", "jsonPath": "compilerOptions.strict", "expected": false, "invert": false }

CRITICAL RULES:
- Regex patterns MUST compile in JavaScript and MUST NOT be catastrophically backtrackable
- No regex like (a+)+ or (.+)*. Anchor where possible. Bound quantifiers.
- Avoid duplicating existing rules (provided as input)
- Each rule targets ONE pattern; do not combine multiple checks
- Patterns must minimize false positives — prefer specific identifiers over generic words
- Recommendations must be actionable, not vague`;

export interface AiPatternOptions {
  apiKey?: string;
  model?: string;
  existingRules: RulePackRule[];
  topics: string[];
  perTopicCount?: number;
  maxRetries?: number;
}

interface ParsedResponse {
  rules: RulePackRule[];
  warnings: string[];
}

function extractJsonArray(raw: string): unknown[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('AI response had no JSON array');
  const slice = raw.slice(start, end + 1);
  const parsed = JSON.parse(slice);
  if (!Array.isArray(parsed)) throw new Error('AI response root was not an array');
  return parsed;
}

function summarizeExisting(rules: RulePackRule[]): string {
  return rules.slice(0, 80).map((r) => `- ${r.id}: ${r.title}`).join('\n');
}

async function generateForTopic(
  client: Anthropic,
  model: string,
  existingSummary: string,
  topic: string,
  count: number
): Promise<RulePackRule[]> {
  const userPrompt = `Existing rules (do not duplicate):
${existingSummary}

Topic: ${topic}
Generate ${count} new rules for this topic.

Return ONLY a JSON array.`;

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const text = response.content
    .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  const arr = extractJsonArray(text);
  return arr as RulePackRule[];
}

export async function generateAiPatternRules(opts: AiPatternOptions): Promise<ParsedResponse> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required for AI pattern generation');

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? 'claude-opus-4-7';
  const perTopic = opts.perTopicCount ?? 8;
  const maxRetries = opts.maxRetries ?? 1;

  const existingSummary = summarizeExisting(opts.existingRules);
  const seenIds = new Set(opts.existingRules.map((r) => r.id));
  const out: RulePackRule[] = [];
  const warnings: string[] = [];

  for (const topic of opts.topics) {
    let attempt = 0;
    let topicRules: RulePackRule[] = [];
    while (attempt <= maxRetries) {
      try {
        topicRules = await generateForTopic(client, model, existingSummary, topic, perTopic);
        break;
      } catch (e) {
        attempt++;
        warnings.push(`AI generation for topic "${topic}" failed (attempt ${attempt}): ${(e as Error).message}`);
        if (attempt > maxRetries) topicRules = [];
      }
    }

    const candidate: import('@shared/rule-pack').RulePack = {
      manifest: {
        schemaVersion: 1,
        packId: 'ai-candidate',
        packVersion: 'temp',
        publishedAt: new Date().toISOString(),
        source: 'remote',
        ruleCount: topicRules.length
      },
      rules: topicRules
    };
    const issues = validatePack(candidate);
    const errorIds = new Set(issues.filter((i) => i.level === 'error' && i.ruleId).map((i) => i.ruleId!));

    for (const rule of topicRules) {
      if (!rule.id) continue;
      if (errorIds.has(rule.id)) {
        warnings.push(`dropping invalid AI rule ${rule.id}`);
        continue;
      }
      if (seenIds.has(rule.id)) {
        warnings.push(`dropping duplicate AI rule ${rule.id}`);
        continue;
      }
      seenIds.add(rule.id);
      out.push(rule);
    }
  }

  return { rules: out, warnings };
}

export const DEFAULT_AI_TOPICS = [
  'CWE-79 Cross-Site Scripting in React/Next.js components',
  'CWE-89 SQL injection in Node.js ORM and raw query usage',
  'CWE-78 OS command injection via child_process',
  'CWE-22 Path traversal in file APIs',
  'CWE-918 Server-Side Request Forgery in URL fetchers',
  'CWE-352 Cross-Site Request Forgery missing protections',
  'CWE-284 Broken authorization in API routes',
  'CWE-209 Sensitive information in error responses',
  'CWE-798 Hardcoded credentials and API keys',
  'CWE-502 Insecure deserialization',
  'Insecure cookie attributes (missing HttpOnly/Secure/SameSite)',
  'Misconfigured rate limiting on auth endpoints',
  'Container security: Dockerfile best practices',
  'AI-generated code smells: incomplete error handling and silent failures'
];
