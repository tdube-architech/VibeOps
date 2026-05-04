import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const out = path.resolve(process.cwd(), 'keypair.out');
fs.mkdirSync(out, { recursive: true });

fs.writeFileSync(path.join(out, 'public.b64'), pubB64);
fs.writeFileSync(path.join(out, 'private.b64'), privB64);

const pubKeyTs = `// Auto-generated. ed25519 SPKI/DER, base64. Used to verify rule packs.
// SECURITY: never commit the matching private key.
export const RULE_PACK_PUBLIC_KEY_B64 =
  '${pubB64}';
`;

fs.writeFileSync(path.join(out, 'pubkey.ts'), pubKeyTs);

console.log('Wrote:');
console.log('  ' + path.join(out, 'public.b64'));
console.log('  ' + path.join(out, 'private.b64'));
console.log('  ' + path.join(out, 'pubkey.ts'));
console.log('');
console.log('Next steps:');
console.log('  1. Copy pubkey.ts to src/main/audit/rule-pack/pubkey.ts in the main repo.');
console.log('  2. Store private.b64 contents in GitHub Actions secret VIBEOPS_PACK_PRIVATE_KEY.');
console.log('  3. Delete the local private.b64 after uploading.');
console.log('  4. Commit only public.b64 / pubkey.ts.');
