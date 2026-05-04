const PATTERNS: Array<{ name: string; re: RegExp; mask: string }> = [
  { name: 'anthropic', re: /sk-ant-[A-Za-z0-9_\-]{8,}/g, mask: '[REDACTED:anthropic-key]' },
  { name: 'openai-proj', re: /sk-proj-[A-Za-z0-9_\-]{8,}/g, mask: '[REDACTED:openai-key]' },
  { name: 'openai', re: /\bsk-[A-Za-z0-9]{20,}/g, mask: '[REDACTED:openai-key]' },
  { name: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}/g, mask: '[REDACTED:github-pat]' },
  { name: 'github-srv', re: /\bghs_[A-Za-z0-9]{20,}/g, mask: '[REDACTED:github-pat]' },
  { name: 'aws-access', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, mask: '[REDACTED:aws-access-key]' },
  { name: 'aws-secret', re: /\b[A-Za-z0-9/+=]{40}\b/g, mask: '[REDACTED:aws-secret]' },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, mask: '[REDACTED:jwt]' },
  { name: 'long-hex', re: /\b[a-f0-9]{40,}\b/g, mask: '[REDACTED:hex-token]' },
  { name: 'postgres-url', re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@]+:[^\s@]+@[^\s/]+/g, mask: '$1://[REDACTED]@host' }
];

const ENV_LINE = /^([A-Z][A-Z0-9_]{1,})\s*=\s*(.+)$/gm;

export interface RedactionResult {
  text: string;
  replaced: number;
}

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let replaced = 0;

  out = out.replace(ENV_LINE, (line, key: string, value: string) => {
    if (!value || value.trim().length === 0) return line;
    if (value.startsWith('[REDACTED')) return line;
    replaced++;
    return `${key}=[REDACTED:env-value]`;
  });

  for (const p of PATTERNS) {
    out = out.replace(p.re, (m, ...groups) => {
      replaced++;
      return p.mask.includes('$1') ? p.mask.replace('$1', String(groups[0])) : p.mask;
    });
  }

  return { text: out, replaced };
}
