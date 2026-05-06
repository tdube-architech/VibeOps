import { describe, it, expect, vi, beforeEach } from 'vitest';

type RpcCall = { name: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcResponse: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResponse);
    }
  })
}));

import {
  toggleSessionControl,
  claimSessionControl,
  releaseSessionControl
} from '@/lib/data/aiSessions';

const STUB_ROW = {
  id: 'sess-1',
  workspace_id: 'ws-1',
  project_id: 'prj-1',
  owner_user_id: 'owner',
  provider: 'claude',
  command: 'claude',
  args: [],
  cwd: 'E:/code/x',
  label: 'Claude Code',
  status: 'active',
  started_at: '2026-05-06T15:00:00Z',
  ended_at: null,
  exit_code: null,
  client_local_id: 'term_abc',
  session_start_sha: null,
  control_open: true,
  controller_user_id: 'driver-1',
  controller_claimed_at: '2026-05-06T15:01:00Z'
};

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResponse = { data: STUB_ROW, error: null };
});

describe('toggleSessionControl', () => {
  it('calls toggle_ai_session_control with open=true', async () => {
    const out = await toggleSessionControl('sess-1', true);
    expect(rpcCalls).toEqual([{
      name: 'toggle_ai_session_control',
      args: { session_id: 'sess-1', is_open: true }
    }]);
    expect(out.controlOpen).toBe(true);
    expect(out.controllerUserId).toBe('driver-1');
    expect(out.controllerClaimedAt).toBe('2026-05-06T15:01:00Z');
  });

  it('calls toggle_ai_session_control with open=false', async () => {
    rpcResponse = {
      data: { ...STUB_ROW, control_open: false, controller_user_id: null, controller_claimed_at: null },
      error: null
    };
    const out = await toggleSessionControl('sess-1', false);
    expect(rpcCalls[0]?.args).toEqual({ session_id: 'sess-1', is_open: false });
    expect(out.controlOpen).toBe(false);
    expect(out.controllerUserId).toBeNull();
  });

  it('throws when server raises non-owner error', async () => {
    rpcResponse = { data: null, error: { message: 'AI_SESSION_NOT_OWNER' } };
    await expect(toggleSessionControl('sess-1', true)).rejects.toThrow(/AI_SESSION_NOT_OWNER/);
  });
});

describe('claimSessionControl', () => {
  it('calls claim_ai_session_control with the session id', async () => {
    await claimSessionControl('sess-1');
    expect(rpcCalls).toEqual([{
      name: 'claim_ai_session_control',
      args: { session_id: 'sess-1' }
    }]);
  });

  it('returns mapped session with controller info', async () => {
    const out = await claimSessionControl('sess-1');
    expect(out.controllerUserId).toBe('driver-1');
    expect(out.controlOpen).toBe(true);
  });

  it('throws AI_SESSION_CONTROL_CLOSED when control is off', async () => {
    rpcResponse = { data: null, error: { message: 'AI_SESSION_CONTROL_CLOSED' } };
    await expect(claimSessionControl('sess-1')).rejects.toThrow(/CONTROL_CLOSED/);
  });

  it('throws AI_SESSION_OWNER_CLAIM when owner tries to claim', async () => {
    rpcResponse = { data: null, error: { message: 'AI_SESSION_OWNER_CLAIM' } };
    await expect(claimSessionControl('sess-1')).rejects.toThrow(/OWNER_CLAIM/);
  });

  it('throws AI_SESSION_NOT_VISIBLE for non-members', async () => {
    rpcResponse = { data: null, error: { message: 'AI_SESSION_NOT_VISIBLE' } };
    await expect(claimSessionControl('sess-1')).rejects.toThrow(/NOT_VISIBLE/);
  });
});

describe('releaseSessionControl', () => {
  it('calls release_ai_session_control', async () => {
    await releaseSessionControl('sess-1');
    expect(rpcCalls).toEqual([{
      name: 'release_ai_session_control',
      args: { session_id: 'sess-1' }
    }]);
  });

  it('throws AI_SESSION_RELEASE_FORBIDDEN for non-owner non-controller', async () => {
    rpcResponse = { data: null, error: { message: 'AI_SESSION_RELEASE_FORBIDDEN' } };
    await expect(releaseSessionControl('sess-1')).rejects.toThrow(/RELEASE_FORBIDDEN/);
  });
});
