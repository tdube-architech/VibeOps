import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { acceptInvitationByToken, declineInvitationByToken } from '@/lib/data/members';

describe('invitation accept / decline RPC dispatch', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcResponse = { data: null, error: null };
  });

  it('accept calls accept_invitation with the token', async () => {
    await acceptInvitationByToken('abc123');
    expect(rpcCalls).toEqual([{ name: 'accept_invitation', args: { invite_token: 'abc123' } }]);
  });

  it('decline calls decline_invitation with the token', async () => {
    await declineInvitationByToken('xyz789');
    expect(rpcCalls).toEqual([{ name: 'decline_invitation', args: { invite_token: 'xyz789' } }]);
  });

  it('accept throws when server raises EMAIL_MISMATCH', async () => {
    rpcResponse = { data: null, error: { message: 'INVITATION_EMAIL_MISMATCH' } };
    await expect(acceptInvitationByToken('t')).rejects.toThrow(/EMAIL_MISMATCH/);
  });

  it('decline throws when token already declined', async () => {
    rpcResponse = { data: null, error: { message: 'INVITATION_NOT_FOUND' } };
    await expect(declineInvitationByToken('t')).rejects.toThrow(/INVITATION_NOT_FOUND/);
  });
});
