// Groth16 proving against the frozen artifacts the deployed escrow trusts (circuits/artifacts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as snarkjs from 'snarkjs';
import type { CircuitInput } from './circuit-input.ts';

const artifacts = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'circuits', 'artifacts');
export const WASM_PATH = join(artifacts, 'release_policy.wasm');
export const ZKEY_PATH = join(artifacts, 'release_policy_final.zkey');
export const VERIFICATION_KEY: object = JSON.parse(readFileSync(join(artifacts, 'verification_key.json'), 'utf8'));

/** Public signal order from snarkjs: outputs first, then public inputs in declaration order. */
export interface ReleasePublicSignals {
  readonly nullifier: bigint;
  readonly tradeId: bigint;
  readonly recipient: bigint;
  readonly priceKobo: bigint;
  readonly deadline: bigint;
  readonly claimCommit: bigint;
}

export interface ReleaseProof {
  readonly proof: snarkjs.Groth16Proof;
  readonly publicSignals: string[];
  readonly signals: ReleasePublicSignals;
}

export function parseSignals(publicSignals: readonly string[]): ReleasePublicSignals {
  if (publicSignals.length !== 6) throw new Error(`expected 6 public signals, got ${publicSignals.length}`);
  const [nullifier, tradeId, recipient, priceKobo, deadline, claimCommit] = publicSignals.map((s) => BigInt(s));
  return { nullifier, tradeId, recipient, priceKobo, deadline, claimCommit };
}

export async function proveRelease(input: CircuitInput): Promise<ReleaseProof> {
  const asStrings = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, (v as bigint).toString()]));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(asStrings, WASM_PATH, ZKEY_PATH);
  if (!(await snarkjs.groth16.verify(VERIFICATION_KEY, publicSignals, proof))) {
    throw new Error('locally generated proof failed verification');
  }
  return { proof, publicSignals, signals: parseSignals(publicSignals) };
}

/** Releases snarkjs worker threads so short-lived processes (tests, scripts) can exit. */
export async function shutdownProver(): Promise<void> {
  const curve = (globalThis as { curve_bn128?: { terminate: () => Promise<void> } }).curve_bn128;
  if (curve) await curve.terminate();
}
