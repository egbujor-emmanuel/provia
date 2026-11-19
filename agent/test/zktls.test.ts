import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimFromProofs, ZkTlsError, type ZkTlsProof } from '../src/zktls.ts';

// A real Reclaim TEE-mode zkFetch proof of Paystack's verify response for test transaction
// vgrzv1uk5extoun (tagged tradeId 1), produced on Linux by .github/workflows/zktls-linux.yml.
const proof = JSON.parse(readFileSync(new URL('./fixtures/reclaim-tee-proof.json', import.meta.url), 'utf8')) as ZkTlsProof;
const ALL = ['status', 'amount', 'currency', 'paid_at', 'tradeId'] as const;
// Attestor listed in https://build.reclaimprotocol.org/.well-known/jwks.json (x-reclaim-attestors), pinned for offline tests.
const opts = { attestorAddresses: ['0x244897572368eadf65bfbc5aec98d8e5443a9072'] };
const expected = { reference: 'vgrzv1uk5extoun', tradeId: 1n, contextAddress: '0x1755E7CA81a3a907bB15637fD40Eb874ADb9815f' };

test('zkTLS: the real Paystack TEE proof verifies and yields the payment claim', async () => {
  const claim = await claimFromProofs([{ fields: ALL, proof }], expected, opts);
  assert.deepEqual(claim, { status: 'success', amountKobo: 150000n, currency: 'NGN', paidAt: 1795100855n, reference: 'vgrzv1uk5extoun', tradeId: 1n });
});

test('zkTLS: the same proof is refused for another trade, another reference, or an untrusted attestor', async () => {
  await assert.rejects(claimFromProofs([{ fields: ALL, proof }], { ...expected, tradeId: 2n }, opts), /different trade/);
  await assert.rejects(claimFromProofs([{ fields: ALL, proof }], { ...expected, reference: 'otherref1234' }, opts), ZkTlsError);
  await assert.rejects(claimFromProofs([{ fields: ALL, proof }], { ...expected, contextAddress: '0x000000000000000000000000000000000000dEaD' }, opts), /different trade/);
  await assert.rejects(claimFromProofs([{ fields: ALL, proof }], expected, { attestorAddresses: ['0x000000000000000000000000000000000000dEaD'] }), ZkTlsError);
});

test('zkTLS: editing a revealed value breaks the attestor signature', async () => {
  const tampered = structuredClone(proof) as { claimData: { context: string } } & ZkTlsProof;
  tampered.claimData.context = tampered.claimData.context.replace('"amount":"150000"', '"amount":"990000"');
  await assert.rejects(claimFromProofs([{ fields: ALL, proof: tampered }], expected, opts), ZkTlsError);
});

test('zkTLS: a proof that reveals fewer fields than it claims to cover is refused', async () => {
  await assert.rejects(claimFromProofs([{ fields: ['status'], proof }], expected, opts), ZkTlsError);
  await assert.rejects(claimFromProofs([], expected, opts), /no proof for field/);
});
