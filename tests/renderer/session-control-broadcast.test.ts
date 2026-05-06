// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * Fake supabase channel that captures every .on subscription and .send call,
 * plus exposes a fireBroadcast() helper so tests can simulate a teammate
 * keystroke arriving on the wire.
 */
type Listener = (msg: { event: string; payload: unknown }) => void;

interface FakeChannel {
  name: string;
  listeners: Listener[];
  sent: Array<{ event: string; payload: unknown }>;
  subscribeStatus: 'pending' | 'SUBSCRIBED';
  on: (kind: string, opts: { event: string }, cb: Listener) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  send: (payload: { type: string; event: string; payload: unknown }) => Promise<void>;
  fireBroadcast: (event: string, payload: unknown) => void;
}

const channels: FakeChannel[] = [];

function makeChannel(name: string): FakeChannel {
  const ch: FakeChannel = {
    name,
    listeners: [],
    sent: [],
    subscribeStatus: 'pending',
    on(kind, opts, cb) {
      if (kind === 'broadcast') {
        ch.listeners.push((msg) => { if (msg.event === opts.event) cb(msg); });
      }
      return ch;
    },
    subscribe(cb) {
      ch.subscribeStatus = 'SUBSCRIBED';
      cb?.('SUBSCRIBED');
      return ch;
    },
    async send(payload) {
      ch.sent.push({ event: payload.event, payload: payload.payload });
    },
    fireBroadcast(event, payload) {
      for (const l of ch.listeners) l({ event, payload });
    }
  };
  return ch;
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    channel: (name: string) => {
      const c = makeChannel(name);
      channels.push(c);
      return c;
    },
    removeChannel: () => Promise.resolve()
  })
}));

import {
  useControlKeystrokeReceiver,
  useControlKeystrokeSender
} from '@/lib/data/aiSessions';

beforeEach(() => {
  channels.length = 0;
});

describe('useControlKeystrokeReceiver', () => {
  it('subscribes once on mount and forwards broadcast keystrokes to the callback', () => {
    const onKey = vi.fn();
    const { unmount } = renderHook(() => useControlKeystrokeReceiver('sess-1', onKey));

    expect(channels).toHaveLength(1);
    const ch = channels[0]!;
    expect(ch.name).toMatch(/^ai-control-sess-1-r-/);
    expect(ch.subscribeStatus).toBe('SUBSCRIBED');

    act(() => ch.fireBroadcast('key', { data: 'hello', fromUserId: 'driver-1' }));
    expect(onKey).toHaveBeenCalledWith('hello', 'driver-1');

    act(() => ch.fireBroadcast('key', { data: '\r', fromUserId: 'driver-1' }));
    expect(onKey).toHaveBeenCalledWith('\r', 'driver-1');
    expect(onKey).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('ignores broadcast events that have no payload data', () => {
    const onKey = vi.fn();
    renderHook(() => useControlKeystrokeReceiver('sess-1', onKey));
    const ch = channels[0]!;

    act(() => ch.fireBroadcast('key', { data: '', fromUserId: 'x' }));
    act(() => ch.fireBroadcast('key', { fromUserId: 'x' }));

    expect(onKey).not.toHaveBeenCalled();
  });

  it('does not subscribe when sessionId is null', () => {
    const onKey = vi.fn();
    renderHook(() => useControlKeystrokeReceiver(null, onKey));
    expect(channels).toHaveLength(0);
  });

  it('only fires for the broadcast event "key" — other events ignored', () => {
    const onKey = vi.fn();
    renderHook(() => useControlKeystrokeReceiver('sess-1', onKey));
    const ch = channels[0]!;
    act(() => ch.fireBroadcast('something-else', { data: 'x', fromUserId: 'u' }));
    expect(onKey).not.toHaveBeenCalled();
  });
});

describe('useControlKeystrokeSender', () => {
  it('subscribes once on mount and broadcasts each keystroke with fromUserId', () => {
    const { result, unmount } = renderHook(() => useControlKeystrokeSender('sess-1', 'me'));

    expect(channels).toHaveLength(1);
    const ch = channels[0]!;
    expect(ch.name).toMatch(/^ai-control-sess-1-s-/);
    expect(ch.subscribeStatus).toBe('SUBSCRIBED');

    act(() => result.current('h'));
    act(() => result.current('i'));

    expect(ch.sent).toEqual([
      { event: 'key', payload: { data: 'h', fromUserId: 'me' } },
      { event: 'key', payload: { data: 'i', fromUserId: 'me' } }
    ]);

    unmount();
  });

  it('returns a no-op when sessionId is null', () => {
    const { result } = renderHook(() => useControlKeystrokeSender(null, 'me'));
    expect(channels).toHaveLength(0);
    // calling the no-op must not throw
    act(() => result.current('x'));
  });

  it('returns a no-op when fromUserId is null', () => {
    const { result } = renderHook(() => useControlKeystrokeSender('sess-1', null));
    expect(channels).toHaveLength(0);
    act(() => result.current('x'));
  });
});
