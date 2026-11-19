// The Provia flow, shared by the home page and How it works.
export const FLOW = [
  { n: '01', title: 'Lock', body: 'The seller locks test USDC in ProviaEscrow on Base Sepolia with the naira price, the buyer’s payout address and a deadline.' },
  { n: '02', title: 'Pay', body: 'The buyer pays the naira price through Paystack. The trade id rides in the payment metadata.' },
  { n: '03', title: 'Claim', body: 'The buyer tells the agent “I’ve paid” in their own words. A deterministic parser pulls out the reference. It reads; it never decides.' },
  { n: '04', title: 'Prove the payment', body: 'zkTLS (Reclaim) proves what Paystack’s verify API returned: status, amount, currency, time and trade id. The secret key never leaves the request.' },
  { n: '05', title: 'Prove the rules', body: 'A Groth16 circuit proves the payment succeeded, in NGN, in full, before the deadline, for this trade, and derives a one-time nullifier from the reference.' },
  { n: '06', title: 'Verify on zkVerify', body: 'The proof is verified on zkVerify mainnet and on testnet, where it is aggregated and the root relayed to Base Sepolia.' },
  { n: '07', title: 'Release', body: 'The escrow rebuilds the leaf from its own trade data, checks verifyProofAggregation, burns the nullifier and pays the buyer. Anything else reverts.' },
] as const;
