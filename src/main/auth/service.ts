import { BrowserWindow, shell } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import { clearSession, readSession, writeSession, type PersistedSession } from './store';

export interface AuthState {
  status: 'unauthenticated' | 'authenticated';
  user: {
    id: string;
    email: string | null;
  } | null;
}

export interface AuthServiceDeps {
  appDataRoot: string;
  supabaseUrl: string;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export class AuthService {
  private state: AuthState = { status: 'unauthenticated', user: null };

  constructor(private readonly deps: AuthServiceDeps) {
    const session = readSession(deps.appDataRoot);
    if (session) {
      this.state = {
        status: 'authenticated',
        user: { id: session.user_id, email: session.email }
      };
    }
  }

  getState(): AuthState {
    return this.state;
  }

  getStoredSession(): PersistedSession | null {
    return readSession(this.deps.appDataRoot);
  }

  saveSession(session: PersistedSession): void {
    writeSession(this.deps.appDataRoot, session);
    this.state = {
      status: 'authenticated',
      user: { id: session.user_id, email: session.email }
    };
    this.broadcast();
  }

  signOut(): void {
    clearSession(this.deps.appDataRoot);
    this.state = { status: 'unauthenticated', user: null };
    this.broadcast();
  }

  async openSignInWithGitHub(): Promise<void> {
    const url = new URL(`${this.deps.supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set('provider', 'github');
    url.searchParams.set('redirect_to', 'vibeops://auth/callback');
    await shell.openExternal(url.toString());
  }

  async openSignInWithMagicLink(_email: string): Promise<void> {
    // Magic-link flow runs from renderer using supabase-js (it knows how to call signInWithOtp).
    // Main process only needs to handle the resulting deep link when the user clicks the email.
    return Promise.resolve();
  }

  handleDeepLink(rawUrl: string): { kind: 'auth-callback'; code: string } | { kind: 'invite'; token: string } | { kind: 'unknown' } {
    let url: URL;
    try { url = new URL(rawUrl); } catch { return { kind: 'unknown' }; }
    const path = url.pathname.replace(/^\/+/, '');
    if (url.host === 'auth' && path === 'callback') {
      const code = url.searchParams.get('code');
      if (code) return { kind: 'auth-callback', code };
    }
    if (url.host === 'accept-invite' && path) {
      return { kind: 'invite', token: path };
    }
    return { kind: 'unknown' };
  }

  forwardDeepLink(rawUrl: string): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.authDeepLink, rawUrl);
  }

  private broadcast(): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.authState, this.state);
  }
}
