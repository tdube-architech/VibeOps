import { describe, it, expect } from 'vitest';
import { IpcChannels, IPC_CHANNEL_LIST } from '@shared/ipc-channels';

describe('IpcChannels', () => {
  it('exposes ping channel', () => {
    expect(IpcChannels.ping).toBe('app:ping');
  });

  it('exposes app version channel', () => {
    expect(IpcChannels.appVersion).toBe('app:version');
  });

  it('all channel values are unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('channel list matches values', () => {
    expect(IPC_CHANNEL_LIST.slice().sort()).toEqual(Object.values(IpcChannels).sort());
  });
});
