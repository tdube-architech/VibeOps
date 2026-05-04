import { safeStorage } from 'electron';

export interface SecretStore {
  encryptToBase64(plaintext: string): string;
  decryptFromBase64(b64: string): string;
  isAvailable(): boolean;
}

export function getSecretStore(): SecretStore {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptToBase64(plaintext: string): string {
      if (!safeStorage.isEncryptionAvailable()) {
        return `unsafe:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
      }
      return `safe:${safeStorage.encryptString(plaintext).toString('base64')}`;
    },
    decryptFromBase64(b64: string): string {
      if (b64.startsWith('safe:')) {
        const payload = Buffer.from(b64.slice('safe:'.length), 'base64');
        return safeStorage.decryptString(payload);
      }
      if (b64.startsWith('unsafe:')) {
        return Buffer.from(b64.slice('unsafe:'.length), 'base64').toString('utf8');
      }
      throw new Error('Unknown secret format');
    }
  };
}
