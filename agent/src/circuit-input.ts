// Maps a trade + zkTLS payment claim to release_policy.circom inputs (PRD §6).
import { createHash } from 'node:crypto';
import { buildPoseidon } from 'circomlibjs';
import { NGN_ISO_NUMERIC, type PaymentClaim, type Trade } from './policy.ts';

const TWO_128 = 1n << 128n;

/** Splits sha256(utf8 reference) into two 128-bit field elements (each below the BN254 field). */
export function referenceToFields(reference: string): { refHi: bigint; refLo: bigint } {
  const digest = BigInt('0x' + createHash('sha256').update(reference, 'utf8').digest('hex'));
  return { refHi: digest / TWO_128, refLo: digest % TWO_128 };
}

export interface CircuitInput {
  readonly tradeId: bigint;
  readonly recipient: bigint;
  readonly priceKobo: bigint;
  readonly deadline: bigint;
  readonly claimCommit: bigint;
  readonly paidKobo: bigint;
  readonly paidAt: bigint;
  readonly refHi: bigint;
  readonly refLo: bigint;
  readonly currency: bigint;
  readonly statusOk: bigint;
}

type Poseidon = Awaited<ReturnType<typeof buildPoseidon>>;
let poseidonPromise: Promise<Poseidon> | undefined;

async function poseidonHash(values: readonly bigint[]): Promise<bigint> {
  poseidonPromise ??= buildPoseidon();
  const poseidon = await poseidonPromise;
  return poseidon.F.toObject(poseidon(values as bigint[])) as bigint;
}

export async function nullifierFor(reference: string): Promise<bigint> {
  const { refHi, refLo } = referenceToFields(reference);
  return poseidonHash([refHi, refLo]);
}

export async function buildCircuitInput(trade: Trade, claim: PaymentClaim): Promise<CircuitInput> {
  const { refHi, refLo } = referenceToFields(claim.reference);
  const currency = claim.currency === 'NGN' ? NGN_ISO_NUMERIC : 0n;
  const statusOk = claim.status === 'success' ? 1n : 0n;
  const claimCommit = await poseidonHash([claim.amountKobo, claim.paidAt, refHi, refLo, currency, statusOk, trade.tradeId]);
  return {
    tradeId: trade.tradeId,
    recipient: BigInt(trade.recipient),
    priceKobo: trade.priceKobo,
    deadline: trade.deadline,
    claimCommit,
    paidKobo: claim.amountKobo,
    paidAt: claim.paidAt,
    refHi,
    refLo,
    currency,
    statusOk,
  };
}
