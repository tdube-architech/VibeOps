import { describe, it, expect } from 'vitest';
import { interpretInviteInput } from '@/lib/data/inviteInput';

describe('interpretInviteInput', () => {
  it('returns null for empty / whitespace input', () => {
    expect(interpretInviteInput('')).toBeNull();
    expect(interpretInviteInput('   ')).toBeNull();
    expect(interpretInviteInput('\t\n')).toBeNull();
  });

  it('routes a plain email to the email branch (lowercased)', () => {
    expect(interpretInviteInput('teammate@example.com')).toEqual({ email: 'teammate@example.com' });
    expect(interpretInviteInput('  Foo@Bar.IO  ')).toEqual({ email: 'foo@bar.io' });
  });

  it('routes a github noreply email to the email branch', () => {
    expect(interpretInviteInput('123456+octocat@users.noreply.github.com'))
      .toEqual({ email: '123456+octocat@users.noreply.github.com' });
  });

  it('routes a leading-@ handle to the github branch (lowercased, @ stripped)', () => {
    expect(interpretInviteInput('@octocat')).toEqual({ githubUsername: 'octocat' });
    expect(interpretInviteInput('@OctoCat')).toEqual({ githubUsername: 'octocat' });
    expect(interpretInviteInput('  @octocat  ')).toEqual({ githubUsername: 'octocat' });
  });

  it('routes a bare github-shaped token to the github branch', () => {
    expect(interpretInviteInput('octocat')).toEqual({ githubUsername: 'octocat' });
    expect(interpretInviteInput('user-name')).toEqual({ githubUsername: 'user-name' });
    expect(interpretInviteInput('a1')).toEqual({ githubUsername: 'a1' });
  });

  it('rejects junk that is neither a valid handle nor an email', () => {
    expect(interpretInviteInput('@')).toBeNull();
    expect(interpretInviteInput('---')).toBeNull();
    expect(interpretInviteInput('not an email')).toBeNull();
    // contains @ but no dot — invalid email shape, not a valid handle either
    expect(interpretInviteInput('foo@bar')).toBeNull();
    // leading hyphen invalid for github
    expect(interpretInviteInput('-bad')).toBeNull();
    // > 39 chars invalid for github
    expect(interpretInviteInput('a'.repeat(40))).toBeNull();
  });

  it('handles empty handle after the @ sign', () => {
    expect(interpretInviteInput('@')).toBeNull();
    expect(interpretInviteInput('@   ')).toBeNull();
  });
});
