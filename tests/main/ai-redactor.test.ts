import { describe, it, expect } from 'vitest';
import { redactSecrets } from '@main/ai/redactor';

describe('redactSecrets', () => {
  it('replaces obvious API keys', () => {
    const r = redactSecrets('Bearer sk-ant-12345abcdef and sk-proj-abc123def456ghi');
    expect(r.text).not.toContain('sk-ant-12345abcdef');
    expect(r.text).not.toContain('sk-proj-abc123def456ghi');
    expect(r.replaced).toBeGreaterThanOrEqual(2);
  });
  it('redacts AWS access key shapes', () => {
    const r = redactSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(r.text).not.toContain('AKIA');
    expect(r.replaced).toBe(1);
  });
  it('redacts Github tokens', () => {
    const r = redactSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(r.text).not.toContain('ghp_');
  });
  it('redacts long generic hex strings (likely API keys)', () => {
    const r = redactSecrets('token=0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(r.text).not.toMatch(/0123456789abcdef0123456789abcdef0123456789abcdef/);
  });
  it('leaves harmless text alone', () => {
    const r = redactSecrets('Hello world. The capital of France is Paris.');
    expect(r.text).toBe('Hello world. The capital of France is Paris.');
    expect(r.replaced).toBe(0);
  });
  it('redacts content inside .env-like assignments', () => {
    const r = redactSecrets('DATABASE_URL=postgresql://user:secretpass@host:5432/db\nAPI_KEY=abcd1234efgh5678ijkl9012');
    expect(r.text).not.toContain('secretpass');
    expect(r.text).not.toContain('abcd1234efgh5678ijkl9012');
  });
});
