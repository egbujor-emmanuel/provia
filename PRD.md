# Provia — Product Requirements (source of truth)

> Read the relevant section before implementing it. Do not re-derive requirements from memory.
> Hackathon: zkVerify Agent Games, Wildcard + Creator tracks. **Deadline: 2026-11-21 22:00 UTC.**

## §1 One line
**Provia is an AI escrow agent that releases crypto only when the buyer's fiat payment is proven to have cleared. A screenshot proves nothing; a zkVerify-verified proof does.**

## §2 Problem
In P2P crypto trades the seller releases crypto after *seeing* a payment: a bank alert, a Pix receipt, a UPI screenshot. Forged proofs are the most common P2P scam. Exchange escrow still relies on a human clicking "release" based on what they see, and that is exactly the step forgery attacks. Industry advice: *"never release escrow until the funds have fully cleared"* (Bybit, SoFi). Nobody can tell a seller, provably, that they have.

First live rail: naira via Paystack. It has an open verify API and is unserved by ZKP2P, which covers US/EU rails only. The design is rail-agnostic.

## §3 Flow (the demo)
`LOCK → PAY → PROVE → VERIFY ON zkVERIFY → RELEASE` and the attack: `FAKE PROOF → REFUSED`.
1. **Lock.** The seller creates a trade (price in kobo, amount of test USDC, buyer's payout address, deadline) and deposits USDC into `ProviaEscrow` on Base Sepolia.
2. **Pay.** The buyer pays the naira price via Paystack checkout (test mode). The trade id is in the Paystack metadata.
3. **Claim.** The buyer tells the agent "I've paid" in their own words. A deterministic parser extracts the Paystack reference (no paid model; decided 2026-11-19, zero budget). It only reads the claim; it never decides.
4. **Prove payment (zkTLS).** The agent runs Reclaim zkFetch on `GET https://api.paystack.co/transaction/verify/:reference`. The secret key is hidden; status, amount, currency, paid_at, reference and metadata.trade_id are revealed.
5. **Policy proof (Groth16).** The agent proves `release_policy.circom` (§6) and submits it to Kurier: **testnet with chainId 84532** (aggregated to Base Sepolia) **and mainnet** (zkVerify mainnet finality).
6. **TEE integration (evidence, not a product claim).** zkVerify Volta `settlementTeePallet` verified a NEAR AI Intel TDX quote (evidence/brain-attestation.json). Provia does not call NEAR AI inference (zero budget), so no claim is made that the agent runs in that enclave.
7. **Release.** `ProviaEscrow.release(...)` rebuilds the leaf from public inputs + vkHash, checks `verifyProofAggregation` on the zkVerify proxy, burns the nullifier and pays the buyer.
8. **Refund.** After the deadline with no release, the seller reclaims.

## §4 Refusal codes (typed; every refusal is a receipt)
`NO_PAYMENT_AT_PSP` (Paystack says not found / not success) · `AMOUNT_SHORT` · `WRONG_CURRENCY` · `PAID_AFTER_DEADLINE` · `REF_REUSED` (nullifier seen) · `TRADE_MISMATCH` (metadata.trade_id ≠ trade) · `PROOF_NOT_FINALIZED` · `ZKTLS_INVALID` · `TRADE_NOT_LOCKED` · `EXPIRED`.

## §5 Invariants (never violate)
- **No model decides release.** Deterministic code plus proofs decide. The claim parser only extracts a reference.
- **Fail closed.** Timeouts, errors or uncertainty mean refuse.
- **The contract rebuilds the leaf itself.** It never accepts a caller-supplied leaf (the Elenchos bug class).
- **Nullifier = Poseidon(paystack reference).** One payment, one release, ever.
- **Money is integers**: kobo for NGN, 6-decimal units for USDC. No floats.
- **Zero mock data.** Every figure comes from a live API or chain read. If a value is unavailable, show "unavailable", never a guess. A banner shows real vs demo.
- Secrets (Paystack sk_test, Kurier keys, Reclaim org token, deployer key, Agent Games HMAC) come only from env and never appear in logs, prompts or the repo.

## §6 Circuit `release_policy.circom` (Groth16 / BN128)
- Public output: `nullifier = Poseidon(refHi, refLo)`.
- Public inputs: `tradeId, recipient, priceKobo, deadline, claimCommit`.
- Private: `paidKobo, paidAt, refHi, refLo, currency, statusOk`.
- Constraints: `statusOk == 1`; `currency == 566` (NGN); `paidKobo >= priceKobo`; `paidAt <= deadline` (64-bit range-checked); `claimCommit == Poseidon(paidKobo, paidAt, refHi, refLo, currency, statusOk, tradeId)`; `recipient` bound by a quadratic constraint.
- `claimCommit` links the proof to the zkTLS claim. Anyone can recompute it from the published Reclaim proof's revealed fields.

## §7 Architecture
`web/` (Next.js, GSAP + Lenis) → `agent/` (Node TS: trade API, Agent Games `/agent` HMAC endpoint, Paystack, Reclaim, prover, Kurier, zkverifyjs TEE evidence) → `circuits/` → `contracts/` (Hardhat, `ProviaEscrow`) → zkVerify (mainnet, Volta) + Base Sepolia.

## §8 Judge surfaces
- No wallet gate on `/`. Live presets and "Judges, start here".
- `/llms.txt`, `/api/openapi.json`, `/how-it-works`, a per-trade public receipt with Subscan, Basescan and Reclaim links.
- `JUDGES.md` (five-minute path), `REPRODUCE.md`, `THREAT_MODEL.md`, `SUBMISSION.md`, `evidence/claims.json`.

## §9 Tests (must pass before any count is quoted)
- Circuit: honest proof verifies; each of AMOUNT_SHORT, WRONG_CURRENCY, PAID_AFTER_DEADLINE, statusOk=0 and a tampered claimCommit is unprovable.
- Contract: release with a valid aggregation; caller-supplied-leaf attack reverts; nullifier replay reverts; refund only after the deadline; wrong recipient reverts.
- Agent: HMAC raw-body verification and preflight; every refusal code; fail-closed on timeout.

## §10 Scope discipline
Every item in §3–§9 ships. Nothing listed may be mocked or left unbuilt. Close gaps by building, never by hiding them.
