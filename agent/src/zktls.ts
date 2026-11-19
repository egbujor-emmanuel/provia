// zkTLS payment proofs: Reclaim zkFetch (Builder mode) over Paystack's verify endpoint. The
// Paystack key travels only in secret headers; only six fields are revealed. The agent then
// re-verifies the attestor signature itself before any field is trusted.
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { hashProofClaimParams, verifyRequestProof, type ReclaimRequestProof } from '@reclaimprotocol/client';
import { PAYSTACK_API, unixSeconds } from './paystack.ts';
import type { PaymentClaim } from './policy.ts';

export const REVEALED_FIELDS = [
  { name: 'status', jsonPath: '$.data.status', regex: '"status":"(?<status>[a-z_]+)"' },
  { name: 'amount', jsonPath: '$.data.amount', regex: '"amount":(?<amount>[0-9]{1,18})' },
  { name: 'currency', jsonPath: '$.data.currency', regex: '"currency":"(?<currency>[A-Z]{3})"' },
  { name: 'paid_at', jsonPath: '$.data.paid_at', regex: '"paid_at":"(?<paid_at>[0-9T:.Z-]{20,30})"' },
  { name: 'reference', jsonPath: '$.data.reference', regex: '"reference":"(?<reference>[A-Za-z0-9._=-]{8,100})"' },
  { name: 'tradeId', jsonPath: '$.data.metadata.tradeId', regex: '"tradeId":"(?<tradeId>[0-9]{1,40})"' },
] as const;

export function verifyUrl(reference: string): string {
  return `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`;
}

export function contextMessage(tradeId: bigint): string {
  return `provia:trade:${tradeId}`;
}

/** The subset of a zkFetch proof Provia stores and re-verifies. */
export interface ZkTlsProof {
  readonly identifier: string;
  readonly claimData: {
    readonly provider: string;
    readonly parameters: string;
    readonly owner: string;
    readonly timestampS: number;
    readonly context: string;
    readonly identifier: string;
    readonly epoch: number;
  };
  readonly signatures: readonly string[];
  readonly witnesses: readonly { readonly id: string; readonly url: string }[];
  readonly extractedParameterValues: Record<string, string>;
}

export class ZkTlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZkTlsError';
  }
}

export async function provePaystackTransaction(args: {
  readonly reference: string;
  readonly tradeId: bigint;
  readonly contextAddress: string;
  readonly orgToken: string | undefined;
  readonly paystackKey: string | undefined;
}): Promise<ZkTlsProof> {
  if (!args.orgToken?.startsWith('rorg_')) throw new ZkTlsError('RECLAIM_ORG_TOKEN (rorg_…) is not set');
  if (!args.paystackKey) throw new ZkTlsError('PAYSTACK_SECRET_KEY is not set');
  const client = new ReclaimClient({ orgToken: args.orgToken, retries: 1, logs: process.env.RECLAIM_LOGS === '1' });
  const proof = await client.zkFetch(
    verifyUrl(args.reference),
    {
      method: 'GET',
      useTee: false,
      context: { contextAddress: args.contextAddress, contextMessage: contextMessage(args.tradeId) },
    },
    {
      headers: { Authorization: `Bearer ${args.paystackKey}` },
      responseMatches: REVEALED_FIELDS.map((f) => ({ type: 'regex' as const, value: f.regex })),
      responseRedactions: REVEALED_FIELDS.map((f) => ({ jsonPath: f.jsonPath, regex: f.regex })),
    },
  );
  return proof as unknown as ZkTlsProof;
}

/** Reclaim Builder's published attestor key set (the official trust root for zkFetch proofs). */
export const RECLAIM_ATTESTOR_JWKS = 'https://build.reclaimprotocol.org/.well-known/jwks.json';

export function expectedHashes(reference: string): string[] {
  return hashProofClaimParams({
    url: verifyUrl(reference),
    method: 'GET',
    body: '',
    responseMatches: REVEALED_FIELDS.map((f) => ({ type: 'regex', value: f.regex })),
    responseRedactions: REVEALED_FIELDS.map((f) => ({ jsonPath: f.jsonPath, regex: f.regex })),
  });
}

/**
 * Verifies a zkFetch proof with Reclaim's official verifier and maps it to a PaymentClaim.
 * Checks: attestor signature from an attestor in Reclaim Builder's published key set; the exact
 * request (URL for this reference, revealed fields) by hash; context bound to this trade and
 * recipient. Throws ZkTlsError on any mismatch. Fails closed if the key set cannot be fetched.
 */
export async function claimFromProof(
  proof: ZkTlsProof,
  expected: { reference: string; tradeId: bigint; contextAddress: string },
  opts: { attestorAddresses?: string[]; fetchImpl?: typeof fetch } = {},
): Promise<PaymentClaim> {
  if (proof.claimData.provider !== 'http') throw new ZkTlsError(`unexpected provider ${proof.claimData.provider}`);
  const outcome = await verifyRequestProof(proof as unknown as ReclaimRequestProof, {
    hashes: expectedHashes(expected.reference),
    expectedContext: { contextAddress: expected.contextAddress, contextMessage: contextMessage(expected.tradeId) },
    ...(opts.attestorAddresses ? { attestorAddresses: opts.attestorAddresses } : { attestorJwksUrl: RECLAIM_ATTESTOR_JWKS }),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  if (!outcome.valid) {
    const reason = outcome.reason ?? 'unknown reason';
    throw new ZkTlsError(/context/i.test(reason) ? `proof is bound to a different trade (${reason})` : `Reclaim verification failed: ${reason}`);
  }

  const context = JSON.parse(proof.claimData.context) as { extractedParameters?: Record<string, string> };
  const v = { ...(context.extractedParameters ?? {}) };
  for (const f of REVEALED_FIELDS) {
    if (typeof v[f.name] !== 'string') throw new ZkTlsError(`revealed field ${f.name} missing`);
  }
  if (v.reference !== expected.reference) throw new ZkTlsError('revealed reference differs from the claimed one');
  const paidAt = unixSeconds(v.paid_at);
  if (paidAt === null) throw new ZkTlsError('revealed paid_at is not a timestamp');

  return {
    status: v.status,
    amountKobo: BigInt(v.amount),
    currency: v.currency,
    paidAt,
    reference: v.reference,
    tradeId: BigInt(v.tradeId),
  };
}
