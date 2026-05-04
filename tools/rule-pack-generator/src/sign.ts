import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { RulePack } from '@shared/rule-pack';
import { canonicalJson } from './canonical.js';

function loadPrivateKey(b64: string) {
  const der = Buffer.from(b64, 'base64');
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function loadPublicKey(b64: string) {
  const der = Buffer.from(b64, 'base64');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function signRulePack(pack: RulePack, privateKeyB64: string): RulePack {
  const body = { ...pack, manifest: { ...pack.manifest, signature: undefined, signatureAlgorithm: 'ed25519' as const } };
  delete (body.manifest as { signature?: string }).signature;
  const data = canonicalJson(body);
  const sig = cryptoSign(null, Buffer.from(data, 'utf8'), loadPrivateKey(privateKeyB64));
  return {
    ...pack,
    manifest: {
      ...pack.manifest,
      signatureAlgorithm: 'ed25519',
      signature: sig.toString('base64')
    }
  };
}

export function verifyRulePack(pack: RulePack, publicKeyB64: string): boolean {
  if (!pack.manifest.signature) return false;
  const sig = Buffer.from(pack.manifest.signature, 'base64');
  const body = { ...pack, manifest: { ...pack.manifest } };
  delete (body.manifest as { signature?: string }).signature;
  const data = canonicalJson(body);
  try {
    return cryptoVerify(null, Buffer.from(data, 'utf8'), loadPublicKey(publicKeyB64), sig);
  } catch {
    return false;
  }
}
