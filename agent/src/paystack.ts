// Paystack (test mode) access. The plain verify call is used only for UX hints; the release path
// trusts the zkTLS-proven copy of the same response, never this one.
import { z } from 'zod';

export const PAYSTACK_API = 'https://api.paystack.co';
/** Paystack's documented test card that succeeds without extra authentication steps. */
const TEST_CARD = { number: '4084084084084081', cvv: '408', expiry_month: '12', expiry_year: '30' } as const;

const verifyData = z.object({
  status: z.string(),
  reference: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  paid_at: z.string().nullable(),
  metadata: z.unknown(),
});
const verifyResponse = z.object({ status: z.boolean(), message: z.string(), data: verifyData.nullable().optional() });
const chargeResponse = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({ status: z.string(), reference: z.string() }).partial().nullable().optional(),
});

export interface PaystackTransaction {
  readonly status: string;
  readonly reference: string;
  readonly amountKobo: bigint;
  readonly currency: string;
  readonly paidAt: bigint | null;
  readonly tradeId: bigint | null;
}

function requireTestKey(secretKey: string | undefined): string {
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not set');
  if (!secretKey.startsWith('sk_test_')) throw new Error('Provia only runs against Paystack test mode (sk_test_)');
  return secretKey;
}

export function tradeIdFromMetadata(metadata: unknown): bigint | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).tradeId;
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,40}$/.test(raw)) return null;
  return BigInt(raw);
}

export function unixSeconds(iso: string | null): bigint | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : null;
}

export async function verifyTransaction(reference: string, secretKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<PaystackTransaction | null> {
  const key = requireTestKey(secretKey);
  const res = await fetchImpl(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Paystack verify HTTP ${res.status}`);
  const body = verifyResponse.parse(await res.json());
  if (!body.data) return null;
  const d = body.data;
  return {
    status: d.status,
    reference: d.reference,
    amountKobo: BigInt(d.amount),
    currency: d.currency,
    paidAt: unixSeconds(d.paid_at),
    tradeId: tradeIdFromMetadata(d.metadata),
  };
}

/**
 * Demo buyer: pays a trade with Paystack's test card (test mode only, no real money) and tags
 * the payment with the trade id so the proof can bind to it.
 */
export async function payWithTestCard(args: { tradeId: bigint; amountKobo: bigint; secretKey: string | undefined; fetchImpl?: typeof fetch }): Promise<string> {
  const key = requireTestKey(args.secretKey);
  const res = await (args.fetchImpl ?? fetch)(`${PAYSTACK_API}/charge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'buyer@example.com',
      amount: args.amountKobo.toString(),
      currency: 'NGN',
      metadata: { tradeId: args.tradeId.toString() },
      card: TEST_CARD,
    }),
  });
  const body = chargeResponse.parse(await res.json());
  if (!res.ok || !body.status || body.data?.status !== 'success' || !body.data.reference) {
    throw new Error(`Paystack test charge did not succeed: ${body.message}`);
  }
  return body.data.reference;
}
