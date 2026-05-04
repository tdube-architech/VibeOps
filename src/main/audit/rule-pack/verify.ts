import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import type { RulePack } from '@shared/rule-pack';
import { canonicalJson } from './canonical';

function loadPublicKey(b64: string) {
  const der = Buffer.from(b64, 'base64');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function verifyRulePackSignature(pack: RulePack, publicKeyB64: string): boolean {
  if (!publicKeyB64) return false;
  if (!pack.manifest?.signature) return false;
  const sig = Buffer.from(pack.manifest.signature, 'base64');
  const body: RulePack = {
    ...pack,
    manifest: { ...pack.manifest }
  };
  delete (body.manifest as { signature?: string }).signature;
  const data = canonicalJson(body);
  try {
    return cryptoVerify(null, Buffer.from(data, 'utf8'), loadPublicKey(publicKeyB64), sig);
  } catch {
    return false;
  }
}
