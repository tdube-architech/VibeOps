import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture rpc calls.
type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcResponse: { data: unknown; error: { message: string } | null } = {
  data: null, error: null
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResponse);
    }
  })
}));

import { inviteMember } from '@/lib/data/members';

const STUB_ROW = {
  id: 'inv-1', workspace_id: 'ws-1', email: 'foo@bar.io',
  role: 'editor', token: 'tkn', invited_by: 'me',
  expires_at: '2030-01-01', created_at: '2025-01-01'
};

describe('inviteMember dispatch', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcResponse = { data: STUB_ROW, error: null };
  });

  it('routes email-only invite to invite_member_v2 with email + null github', async () => {
    await inviteMember('ws-1', { email: 'teammate@example.com' }, 'editor');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe('invite_member_v2');
    expect(rpcCalls[0]?.args).toEqual({
      ws_id: 'ws-1',
      invitee_email: 'teammate@example.com',
      invitee_github: null,
      invitee_role: 'editor'
    });
  });

  it('routes github-username invite to invite_member_v2 with github + null email', async () => {
    await inviteMember('ws-1', { githubUsername: 'octocat' }, 'viewer');
    expect(rpcCalls[0]?.args).toEqual({
      ws_id: 'ws-1',
      invitee_email: null,
      invitee_github: 'octocat',
      invitee_role: 'viewer'
    });
  });

  it('passes both fields when caller supplies both', async () => {
    await inviteMember('ws-1', { email: 'a@b.io', githubUsername: 'octocat' });
    expect(rpcCalls[0]?.args).toMatchObject({
      invitee_email: 'a@b.io',
      invitee_github: 'octocat'
    });
  });

  it('throws on RPC error and surfaces server message', async () => {
    rpcResponse = { data: null, error: { message: 'NOT_A_VIBEOPS_USER' } };
    await expect(inviteMember('ws-1', { githubUsername: 'ghost' }))
      .rejects.toThrow(/NOT_A_VIBEOPS_USER/);
  });

  it('defaults role to editor when omitted', async () => {
    await inviteMember('ws-1', { email: 'a@b.io' });
    expect(rpcCalls[0]?.args).toMatchObject({ invitee_role: 'editor' });
  });
});
