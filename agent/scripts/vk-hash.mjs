// Compute a Groth16 (snarkjs, bn128) verification key's zkVerify vkHash via a read-only RPC session.
// Usage: node scripts/vk-hash.mjs <verification_key.json> [expectedHash]
import { readFileSync } from 'node:fs';
import { zkVerifySession, ProofType, CurveType, Library } from 'zkverifyjs';

const [vkPath, expected] = process.argv.slice(2);
if (!vkPath) {
  process.stderr.write('usage: node scripts/vk-hash.mjs <verification_key.json> [expectedHash]\n');
  process.exit(2);
}

const vk = JSON.parse(readFileSync(vkPath, 'utf8'));
const session = await zkVerifySession.start().zkVerify().readOnly();
try {
  const vkHash = await session.getVkHash(
    { proofType: ProofType.groth16, config: { curve: CurveType.bn128, library: Library.snarkjs } },
    vk,
  );
  process.stdout.write(`vkHash ${vkHash}\n`);
  if (expected) {
    const match = vkHash.toLowerCase() === expected.toLowerCase();
    process.stdout.write(`expected ${expected} -> ${match ? 'MATCH' : 'MISMATCH'}\n`);
    process.exitCode = match ? 0 : 1;
  }
} finally {
  await session.close();
}
