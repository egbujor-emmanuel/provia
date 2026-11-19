import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

const here = dirname(fileURLToPath(import.meta.url));
// Tests run against the frozen artifacts the deployed escrow trusts (circuits/artifacts/README.md).
const artifacts = join(here, '..', 'artifacts');
const WASM = join(artifacts, 'release_policy.wasm');
const ZKEY = join(artifacts, 'release_policy_final.zkey');
const VKEY = JSON.parse(readFileSync(join(artifacts, 'verification_key.json'), 'utf8'));

const NGN = 566n;
let poseidon;
let F;

before(async () => {
  poseidon = await buildPoseidon();
  F = poseidon.F;
});

// snarkjs keeps its bn128 worker threads alive; terminate them so the test process exits.
after(async () => {
  if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
});

const hash = (xs) => F.toObject(poseidon(xs));

function honestInput() {
  const trade = {
    tradeId: 1001n,
    recipient: 0x1111111111111111111111111111111111111111n,
    priceKobo: 5_000_000n,
    deadline: 1_795_200_000n,
  };
  const claim = {
    paidKobo: 5_000_000n,
    paidAt: 1_795_100_000n,
    refHi: 0x70726f7669615f726566n,
    refLo: 0x30303031n,
    currency: NGN,
    statusOk: 1n,
  };
  return withCommit({ ...trade, ...claim });
}

function withCommit(i) {
  const claimCommit = hash([i.paidKobo, i.paidAt, i.refHi, i.refLo, i.currency, i.statusOk, i.tradeId]);
  return { ...i, claimCommit };
}

const toStrings = (i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v.toString()]));

async function prove(input) {
  return snarkjs.groth16.fullProve(toStrings(input), WASM, ZKEY);
}

async function assertUnprovable(input, label) {
  await assert.rejects(() => prove(input), undefined, `${label} must not produce a proof`);
}

test('honest payment proves, verifies, and emits Poseidon(ref) as nullifier', async () => {
  const input = honestInput();
  const { proof, publicSignals } = await prove(input);
  assert.equal(await snarkjs.groth16.verify(VKEY, publicSignals, proof), true);
  // snarkjs order: outputs first, then public inputs in declaration order.
  const [nullifier, tradeId, recipient, priceKobo, deadline, claimCommit] = publicSignals.map(BigInt);
  assert.equal(nullifier, hash([input.refHi, input.refLo]));
  assert.deepEqual(
    [tradeId, recipient, priceKobo, deadline, claimCommit],
    [input.tradeId, input.recipient, input.priceKobo, input.deadline, input.claimCommit],
  );
});

test('overpayment is accepted', async () => {
  const { proof, publicSignals } = await prove(withCommit({ ...honestInput(), paidKobo: 6_000_000n }));
  assert.equal(await snarkjs.groth16.verify(VKEY, publicSignals, proof), true);
});

test('AMOUNT_SHORT: paying one kobo less is unprovable', async () => {
  await assertUnprovable(withCommit({ ...honestInput(), paidKobo: 4_999_999n }), 'short payment');
});

test('WRONG_CURRENCY: a USD (840) payment is unprovable', async () => {
  await assertUnprovable(withCommit({ ...honestInput(), currency: 840n }), 'wrong currency');
});

test('PAID_AFTER_DEADLINE: paying one second late is unprovable', async () => {
  const i = honestInput();
  await assertUnprovable(withCommit({ ...i, paidAt: i.deadline + 1n }), 'late payment');
});

test('NO_PAYMENT_AT_PSP: a non-success status is unprovable', async () => {
  await assertUnprovable(withCommit({ ...honestInput(), statusOk: 0n }), 'failed payment');
});

test('tampered claim: claimCommit for different fields is unprovable', async () => {
  const i = honestInput();
  const forged = { ...i, paidKobo: 9_000_000n };
  await assertUnprovable({ ...forged, claimCommit: i.claimCommit }, 'tampered claim');
});

test('TRADE_MISMATCH: a claim committed to another trade is unprovable', async () => {
  const i = honestInput();
  const otherTradeCommit = hash([i.paidKobo, i.paidAt, i.refHi, i.refLo, i.currency, i.statusOk, 1002n]);
  await assertUnprovable({ ...i, claimCommit: otherTradeCommit }, 'cross-trade claim');
});

test('a proof does not verify against a changed recipient', async () => {
  const { proof, publicSignals } = await prove(honestInput());
  const swapped = [...publicSignals];
  swapped[2] = (0x2222222222222222222222222222222222222222n).toString();
  assert.equal(await snarkjs.groth16.verify(VKEY, swapped, proof), false);
});

test('field wrap-around cannot fake paidKobo >= priceKobo', async () => {
  const p = 21888242871839275222246405745257275088548364400416711303009522949311349895999n + 618n;
  await assertUnprovable(withCommit({ ...honestInput(), paidKobo: p - 1n }), 'wrapped amount');
});
