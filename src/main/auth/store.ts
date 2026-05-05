import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

export interface PersistedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user_id: string;
  email: string | null;
}

const FILE_NAME = 'auth.json';

function filePath(appDataRoot: string): string {
  return path.join(appDataRoot, FILE_NAME);
}

export function readSession(appDataRoot: string): PersistedSession | null {
  const file = filePath(appDataRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file);
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(raw);
        return JSON.parse(decrypted) as PersistedSession;
      } catch {
        return null;
      }
    }
    return JSON.parse(raw.toString('utf8')) as PersistedSession;
  } catch {
    return null;
  }
}

export function writeSession(appDataRoot: string, session: PersistedSession): void {
  const file = filePath(appDataRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(session);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(file, safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(file, json, 'utf8');
  }
}

export function clearSession(appDataRoot: string): void {
  const file = filePath(appDataRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
