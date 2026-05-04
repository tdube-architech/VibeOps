import { describe, it, expect } from 'vitest';
import { extractEnvVarNames } from '@main/scanner/detectors/env-vars';

describe('extractEnvVarNames', () => {
  it('extracts variable names without storing values', () => {
    const out = extractEnvVarNames('.env.example', `
# Example env
DATABASE_URL=postgres://example
API_KEY="real-looking-but-example"
EMPTY=
NEXT_PUBLIC_FEATURE_FLAG=true
# Trailing comment
`);
    expect(out.map((v) => v.variable).sort()).toEqual(
      ['API_KEY', 'DATABASE_URL', 'EMPTY', 'NEXT_PUBLIC_FEATURE_FLAG'].sort()
    );
    for (const v of out) {
      expect(v).not.toHaveProperty('value');
    }
  });
  it('captures comments above a variable as the comment field', () => {
    const out = extractEnvVarNames('.env.example', `
# Stripe key for billing
STRIPE_SECRET_KEY=sk_test
`);
    expect(out[0]?.variable).toBe('STRIPE_SECRET_KEY');
    expect(out[0]?.comment).toBe('Stripe key for billing');
  });
  it('marks NEXT_PUBLIC_ as not required by default', () => {
    const out = extractEnvVarNames('.env.example', 'NEXT_PUBLIC_X=1\nDB_URL=2\n');
    expect(out.find((v) => v.variable === 'NEXT_PUBLIC_X')?.required).toBe(false);
    expect(out.find((v) => v.variable === 'DB_URL')?.required).toBe(true);
  });
  it('skips obvious non-key lines', () => {
    const out = extractEnvVarNames('.env.example', 'this is not a key\n=alone\nlowercase=ignored\n');
    expect(out.map((v) => v.variable)).not.toContain('lowercase');
    expect(out.map((v) => v.variable)).not.toContain('');
  });
});
