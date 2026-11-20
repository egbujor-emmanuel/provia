# Submission answers (zkVerify Agent Games, Wildcard)

Version-controlled so the form matches the repo word for word. Numbers here must match README, the site and `evidence/claims.json`.

## Agent name
Provia

## Agent link
- Live site: https://provia-ten.vercel.app
- Repository: https://github.com/egbujor-emmanuel/provia
- Five-minute path: https://github.com/egbujor-emmanuel/provia/blob/master/JUDGES.md

## Public HTTPS endpoint
https://provia-ch7d.onrender.com/agent (Agent Games protocol; HMAC-SHA256 `x-agent-games-signature` over the raw body; signed preflight `{ok:true, protocolVersion:"v1"}`)

Public API: https://provia-ch7d.onrender.com/api/config

## Use case (short)
Crypto escrow that releases only on a verified payment proof. In P2P trades, sellers release crypto after looking at a payment alert, and alerts are easy to fake. Provia holds the crypto in a contract and pays out only when the payment processor's own record is proven with zkTLS and the trade rules are proven with a Groth16 proof verified on zkVerify. The contract checks zkVerify's attestation itself.

## Build context
- Circuit: `release_policy.circom` (Groth16/BN128): payment succeeded, trade currency, paid ≥ price, paid before the deadline, bound to this trade and recipient; public output `nullifier = Poseidon(reference)`; `claimCommit` binds the zkTLS-revealed fields.
- zkTLS: Reclaim zkFetch over the processor's verify API (Paystack test mode), verified with Reclaim's official verifier against Reclaim Builder's published attestor set.
- zkVerify: every release proof submitted through Kurier to zkVerify mainnet, and to zkVerify testnet with aggregation to Base Sepolia.
- Contract: `ProviaEscrow` on Base Sepolia accepts `release` only from the agent and only before the deadline; it rebuilds the statement leaf from its own trade data and `vkHash`, calls `verifyProofAggregation` on the zkVerify proxy for its pinned aggregation domain, burns the nullifier and pays the recorded buyer.
- Agent: Node/TypeScript on Render; deterministic release policy, no model in the decision; typed refusals; public receipts persisted to a dataset.
- Tests: 58 (10 circuit, 13 contract, 35 agent) plus typecheck. `npm run evidence:verify` runs 19 public checks.

## How zkVerify helps (verifiability)
The escrow pays only after zkVerify attests a proof whose public inputs the contract recomputes: trade id, recipient, price, deadline, nullifier and claim commitment. Only the agent, which verified the zkTLS payment proof, may call release, and even it cannot change the recipient, price, deadline or reuse a payment. Every release proof is also submitted to zkVerify mainnet, so each verdict has a public mainnet record.

## Evidence
- Live release on the current escrow: lock https://sepolia.basescan.org/tx/0x097c4084cba8497ee58797c8eb7f4d1542b21680a973941f9a407c9ae9725792 · zkVerify mainnet https://zkverify.subscan.io/extrinsic/0x63b3962731b091746017fb4a80c5d2180ccd9f29d86dc4d0f3d0eef38c2929b1 · zkVerify aggregation https://zkverify-testnet.subscan.io/extrinsic/0x6ba14ea7701a6e4a6a075d509f5e20c367f05511abfb1cec371b1096f9af55d8 · release https://sepolia.basescan.org/tx/0x19ff297143d46eece014b0fbc37b962265ab43de5fde14496cc7b27879ca27cb
- Four attacks refused live: `NO_PAYMENT_AT_PSP`, `AMOUNT_SHORT`, `TRADE_MISMATCH`, `REF_REUSED` (receipts in `evidence/claims.json`)
- Escrow: https://sepolia.basescan.org/address/0x92C4a650CB874cB5d450765CEA619c3Dc49aeC79

## Public share (bonus)
X thread with #AgentGames and @ZKVProtocol: link added when posted.
