// zkTLS payment proofs: Reclaim zkFetch (Builder mode) over Paystack's verify endpoint.
// The Paystack key travels only in secret headers. Reclaim's attestor drops large proofs, so the
// agent proves one field per zkFetch call (each a small proof), all of the same signed request URL
// and bound to the same trade context. Every proof is checked with Reclaim's official verifier
// against Reclaim Builder's published attestor set before any field is trusted.
// The reference itself is not revealed from the body: it is inside the signed request URL.
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { hashProofClaimParams, verifyRequestProof, type ReclaimRequestProof } from '@reclaimprotocol/client';
import { PAYSTACK_API, unixSeconds } from './paystack.ts';
import type { PaymentClaim } from './policy.ts';

export const REVEALED_FIELDS = [
  { name: 'status', jsonPath: '$.data.status', regex: '"status":"(?<status>[a-z_]+)"' },
  { name: 'amount', jsonPath: '$.data.amount', regex: '"amount":(?<amount>[0-9]{1,18})' },
  { name: 'currency', jsonPath: '$.data.currency', regex: '"currency":"(?<currency>[A-Z]{3})"' },
  { name: 'paid_at', jsonPath: '$.data.paid_at', regex: '"paid_at":"(?<paid_at>[0-9T:.Z-]{20,30})"' },
  { name: 'tradeId', jsonPath: '$.data.metadata.tradeId', regex: '"tradeId":"(?<tradeId>[0-9]{1,40})"' },
] as const;
export type RevealedField = (typeof REVEALED_FIELDS)[number];
export type FieldName = RevealedField['name'];

/** Proofs generated at once; larger bursts make the attestor drop connections. */
const PROOF_CONCURRENCY = 2;
/** Proofs must come from one sitting, so they describe the same settled payment. */
const MAX_PROOF_SPREAD_S = 15 * 60;

export const RECLAIM_ATTESTOR_JWKS = 'https://build.reclaimprotocol.org/.well-known/jwks.json';

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

export interface FieldProof {
  readonly field: FieldName;
  readonly proof: ZkTlsProof;
}

export class ZkTlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZkTlsError';
  }
}

function fieldParams(reference: string, f: RevealedField) {
  return {
    url: verifyUrl(reference),
    method: 'GET',
    body: '',
    responseMatches: [{ type: 'regex', value: f.regex }],
    responseRedactions: [{ jsonPath: f.jsonPath, regex: f.regex }],
  };
}

/** The exact request hash a proof of `field` for `reference` must carry. */
export function expectedFieldHashes(reference: string, field: FieldName): string[] {
  const f = REVEALED_FIELDS.find((x) => x.name === field);
  if (!f) throw new ZkTlsError(`unknown field ${field}`);
  return hashProofClaimParams(fieldParams(reference, f));
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function provePaystackTransaction(args: {
  readonly reference: string;
  readonly tradeId: bigint;
  readonly contextAddress: string;
  readonly orgToken: string | undefined;
  readonly paystackKey: string | undefined;
  readonly onField?: (field: FieldName, ms: number) => void;
}): Promise<FieldProof[]> {
  if (!args.orgToken?.startsWith('rorg_')) throw new ZkTlsError('RECLAIM_ORG_TOKEN (rorg_…) is not set');
  if (!args.paystackKey) throw new ZkTlsError('PAYSTACK_SECRET_KEY is not set');
  const client = new ReclaimClient({ orgToken: args.orgToken, retries: 3, logs: process.env.RECLAIM_LOGS === '1' });
  return mapLimit(REVEALED_FIELDS, PROOF_CONCURRENCY, async (f) => {
    const t0 = Date.now();
    const p = fieldParams(args.reference, f);
    const proof = await client.zkFetch(
      p.url,
      { method: 'GET', useTee: false, context: { contextAddress: args.contextAddress, contextMessage: contextMessage(args.tradeId) } },
      { headers: { Authorization: `Bearer ${args.paystackKey}` }, responseMatches: [{ type: 'regex', value: f.regex }], responseRedactions: p.responseRedactions },
    );
    args.onField?.(f.name, Date.now() - t0);
    return { field: f.name, proof: proof as unknown as ZkTlsProof };
  });
}

/**
 * Verifies every field proof with Reclaim's official verifier and assembles the PaymentClaim.
 * Each proof must: be signed by an attestor in Reclaim Builder's published key set; carry the
 * exact request hash for its field and this reference (so the URL names this reference); and be
 * bound to this trade and recipient by context. All proofs must fall within one 15-minute window.
 * Throws ZkTlsError on any mismatch; fails closed if the attestor key set cannot be fetched.
 */
export async function claimFromProofs(
  proofs: readonly FieldProof[],
  expected: { reference: string; tradeId: bigint; contextAddress: string },
  opts: { attestorAddresses?: string[]; fetchImpl?: typeof fetch } = {},
): Promise<PaymentClaim> {
  const values: Partial<Record<FieldName, string>> = {};
  const times: number[] = [];
  for (const f of REVEALED_FIELDS) {
    const fp = proofs.find((x) => x.field === f.name);
    if (!fp) throw new ZkTlsError(`no proof for field ${f.name}`);
    const { proof } = fp;
    if (proof.claimData.provider !== 'http') throw new ZkTlsError(`unexpected provider ${proof.claimData.provider}`);
    const outcome = await verifyRequestProof(proof as unknown as ReclaimRequestProof, {
      hashes: expectedFieldHashes(expected.reference, f.name),
      expectedContext: { contextAddress: expected.contextAddress, contextMessage: contextMessage(expected.tradeId) },
      ...(opts.attestorAddresses ? { attestorAddresses: opts.attestorAddresses } : { attestorJwksUrl: RECLAIM_ATTESTOR_JWKS }),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    if (!outcome.valid) {
      const reason = outcome.reason ?? 'unknown reason';
      throw new ZkTlsError(/context/i.test(reason) ? `proof is bound to a different trade (${reason})` : `Reclaim verification of ${f.name} failed: ${reason}`);
    }
    const context = JSON.parse(proof.claimData.context) as { extractedParameters?: Record<string, string> };
    const value = context.extractedParameters?.[f.name];
    if (typeof value !== 'string') throw new ZkTlsError(`revealed field ${f.name} missing`);
    values[f.name] = value;
    times.push(proof.claimData.timestampS);
  }
  if (Math.max(...times) - Math.min(...times) > MAX_PROOF_SPREAD_S) throw new ZkTlsError('field proofs were not produced in one sitting');

  const paidAt = unixSeconds(values.paid_at ?? null);
  if (paidAt === null) throw new ZkTlsError('revealed paid_at is not a timestamp');
  return {
    status: values.status!,
    amountKobo: BigInt(values.amount!),
    currency: values.currency!,
    paidAt,
    reference: expected.reference,
    tradeId: BigInt(values.tradeId!),
  };
}
