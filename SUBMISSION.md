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
- Contract: `ProviaEscrow` on Base Sepolia rebuilds the statement leaf from its own trade data and `vkHash`, calls `verifyProofAggregation` on the zkVerify proxy, burns the nullifier and pays the recorded buyer.
- Agent: Node/TypeScript on Render; deterministic release policy, no model in the decision; typed refusals; public receipts persisted to a dataset.
- Tests: 55 (10 circuit, 10 contract, 35 agent) plus typecheck. `npm run evidence:verify` runs 19 public checks.

## How zkVerify helps (verifiability)
The escrow cannot be talked into a release. It pays only after zkVerify attests a proof whose public inputs the contract recomputes: trade id, recipient, price, deadline, nullifier and claim commitment. A compromised agent cannot release funds for a payment it cannot prove. Every release proof is also verified on zkVerify mainnet for finality.

## Evidence
- First live release: lock https://sepolia.basescan.org/tx/0xe37391cec2221d32228f1996a9243fd386c27e69ad375f259b36dec6be5f13ff · zkVerify mainnet https://zkverify.subscan.io/extrinsic/0x1e11a7dc810b63166a0beaa0f7958baa3a1375e972da87bc752f3510d8277905 · zkVerify aggregation https://zkverify-testnet.subscan.io/extrinsic/0x3214d4232db24fd03d8b95630572fd84f3536f15234cd60a24f7fdfd611e3e2a · release https://sepolia.basescan.org/tx/0x9b083be9e004417e3acd9aafdf9a90821fa94a3bc8c3a31aa595b6d5aef61746
- Four attacks refused live: `NO_PAYMENT_AT_PSP`, `AMOUNT_SHORT`, `TRADE_MISMATCH`, `REF_REUSED` (receipts in `evidence/claims.json`)
- Escrow: https://sepolia.basescan.org/address/0x2786C763748BED21787916D8EC766F1Cde929a26

## Public share (bonus)
X thread with #AgentGames and @ZKVProtocol: link added when posted.
