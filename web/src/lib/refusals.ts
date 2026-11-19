// Mirrors agent/src/refusals.ts (PRD §4). The live list is also served by the agent at /api/config.
export const REFUSALS: Record<string, string> = {
  NO_PAYMENT_AT_PSP: 'The payment processor reports no successful payment for this reference.',
  AMOUNT_SHORT: 'The cleared amount is below the trade price.',
  WRONG_CURRENCY: 'The payment was not made in the trade currency (NGN).',
  PAID_AFTER_DEADLINE: 'The payment cleared after the trade deadline.',
  REF_REUSED: 'This payment reference has already released a trade.',
  TRADE_MISMATCH: 'The payment is attached to a different trade.',
  PROOF_NOT_FINALIZED: 'The release proof has not reached finality on zkVerify.',
  ZKTLS_INVALID: 'The zkTLS proof of the payment failed verification.',
  TRADE_NOT_LOCKED: 'The trade is not locked in escrow.',
  EXPIRED: 'The trade deadline has passed.',
};
