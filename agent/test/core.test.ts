import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRelease, type PaymentClaim, type Trade } from '../src/policy.ts';
import { sign, verify } from '../src/hmac.ts';
import { buildCircuitInput, nullifierFor, referenceToFields } from '../src/circuit-input.ts';
import { proveRelease, shutdownProver } from '../src/prover.ts';
import type { RefusalCode } from '../src/refusals.ts';

after(shutdownProver);

const NOW = 1_795_100_000n;
const trade: Trade = {
  tradeId: 4242n,
  recipient: '0x1111111111111111111111111111111111111111',
  priceKobo: 5_000_000n,
  deadline: NOW + 3_600n,
  locked: true,
};
const claim: PaymentClaim = {
  status: 'success',
  amountKobo: 5_000_000n,
  currency: 'NGN',
  paidAt: NOW - 60n,
  reference: 'provia-T4242-ref-001',
  tradeId: 4242n,
};
const unused = () => false;

test('policy approves an honest, on-time, full payment', () => {
  assert.deepEqual(evaluateRelease(trade, claim, unused, NOW), { ok: true });
});

const refusalCases: ReadonlyArray<[RefusalCode, Partial<PaymentClaim>, Partial<Trade>?, ((r: string) => boolean)?]> = [
  ['NO_PAYMENT_AT_PSP', { status: 'failed' }],
  ['TRADE_MISMATCH', { tradeId: 9999n }],
  ['WRONG_CURRENCY', { currency: 'USD' }],
  ['AMOUNT_SHORT', { amountKobo: 4_999_999n }],
  ['PAID_AFTER_DEADLINE', { paidAt: trade.deadline + 1n }],
  ['REF_REUSED', {}, {}, () => true],
  ['TRADE_NOT_LOCKED', {}, { locked: false }],
];

for (const [code, claimPatch, tradePatch = {}, used = unused] of refusalCases) {
  test(`policy refuses with ${code}`, () => {
    const result = evaluateRelease({ ...trade, ...tradePatch }, { ...claim, ...claimPatch }, used, NOW);
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, code);
  });
}

test('policy refuses with EXPIRED once the deadline has passed', () => {
  const result = evaluateRelease(trade, claim, unused, trade.deadline + 1n);
  assert.equal((result as { code: string }).code, 'EXPIRED');
});

test('hmac: valid signature verifies; tampered body, wrong secret and missing header fail', () => {
  const body = '{"type":"agent-games.preflight.v1","nonce":"abc"}';
  const sig = sign(body, 'secret-1');
  assert.equal(verify(body, sig, 'secret-1'), true);
  assert.equal(verify(body, `sha256=${sig}`, 'secret-1'), true);
  assert.equal(verify(body + ' ', sig, 'secret-1'), false);
  assert.equal(verify(body, sig, 'secret-2'), false);
  assert.equal(verify(body, undefined, 'secret-1'), false);
  assert.equal(verify(body, 'zz', 'secret-1'), false);
});

test('reference fields are two 128-bit values and deterministic', () => {
  const a = referenceToFields(claim.reference);
  const b = referenceToFields(claim.reference);
  assert.deepEqual(a, b);
  assert.ok(a.refHi < 1n << 128n && a.refLo < 1n << 128n);
  assert.notDeepEqual(referenceToFields('other-ref'), a);
});

test('honest claim proves against the frozen artifacts; nullifier = Poseidon(reference)', async () => {
  const input = await buildCircuitInput(trade, claim);
  const { signals } = await proveRelease(input);
  assert.equal(signals.nullifier, await nullifierFor(claim.reference));
  assert.equal(signals.tradeId, trade.tradeId);
  assert.equal(signals.recipient, BigInt(trade.recipient));
  assert.equal(signals.priceKobo, trade.priceKobo);
  assert.equal(signals.deadline, trade.deadline);
  assert.equal(signals.claimCommit, input.claimCommit);
});

test('policy and circuit agree: every claim the policy refuses is also unprovable', async () => {
  const proofRelevant: ReadonlyArray<Partial<PaymentClaim>> = [
    { status: 'failed' },
    { currency: 'USD' },
    { amountKobo: 4_999_999n },
    { paidAt: trade.deadline + 1n },
  ];
  for (const patch of proofRelevant) {
    const bad = { ...claim, ...patch };
    assert.equal(evaluateRelease(trade, bad, unused, NOW).ok, false);
    await assert.rejects(async () => proveRelease(await buildCircuitInput(trade, bad)), `circuit must reject ${JSON.stringify(patch, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  }
});
