// Deterministic release policy (PRD §5, §6). Mirrors release_policy.circom exactly, so the agent
// refuses with a typed code before spending any proving or verification effort.
// The language model never reaches this function's decision.
import { refuse, type Refusal } from './refusals.ts';

export const NGN_ISO_NUMERIC = 566n;

export interface Trade {
  readonly tradeId: bigint;
  readonly recipient: string;
  readonly priceKobo: bigint;
  readonly deadline: bigint; // unix seconds
  readonly locked: boolean;
}

/** Fields revealed by the zkTLS proof of the payment processor's verify response. */
export interface PaymentClaim {
  readonly status: string;
  readonly amountKobo: bigint;
  readonly currency: string;
  readonly paidAt: bigint; // unix seconds
  readonly reference: string;
  readonly tradeId: bigint;
}

export interface Approval {
  readonly ok: true;
}

export function evaluateRelease(
  trade: Trade,
  claim: PaymentClaim,
  isReferenceUsed: (reference: string) => boolean,
  nowSeconds: bigint,
): Approval | Refusal {
  if (!trade.locked) return refuse('TRADE_NOT_LOCKED');
  if (claim.status !== 'success') return refuse('NO_PAYMENT_AT_PSP');
  if (claim.tradeId !== trade.tradeId) return refuse('TRADE_MISMATCH');
  if (claim.currency !== 'NGN') return refuse('WRONG_CURRENCY');
  if (claim.amountKobo < trade.priceKobo) return refuse('AMOUNT_SHORT');
  if (claim.paidAt > trade.deadline) return refuse('PAID_AFTER_DEADLINE');
  if (nowSeconds > trade.deadline) return refuse('EXPIRED');
  if (isReferenceUsed(claim.reference)) return refuse('REF_REUSED');
  return { ok: true };
}
