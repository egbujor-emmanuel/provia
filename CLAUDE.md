# CLAUDE.md — Provia

> **Competition:** zkVerify Agent Games (Horizen Labs), **Wildcard** + **Creator Track**.
> **Hard deadline:** **2026-11-21 22:00 UTC.** Judging is 22–30 Nov.
> **Pitch:** *An AI escrow agent that releases crypto only when the buyer's payment is proven to have cleared.*
> **Tagline:** *A screenshot proves nothing. Provia proves it cleared.*
> **[PRD.md](PRD.md) is the source of truth.** Read the relevant § before implementing.

## 1. Never lose sight of the rubric
Wildcard criteria are quoted from agentgames.zkverify.io/events/wildcard. The site gives no weights; these weights reflect its emphasis.

| Criterion (quoted) | Weight | What wins it in Provia |
|---|---|---|
| **Useful problem**: "Show a clear need, who the agent helps, and why its work matters." | 30 | Forged payment proofs in P2P trades; sellers lose crypto. A cold open on a fake proof being refused |
| **Working implementation**: "see the agent in action." | 30 | Live site; real Paystack test payment → real Reclaim proof → zkVerify mainnet finality + testnet aggregation → Base Sepolia release, all linked |
| **Clear explanation**: "workflow, key choices, what the agent can and cannot do." | 20 | `/how-it-works`, JUDGES.md five-minute path, THREAT_MODEL.md, typed refusal codes |
| **Verifiability (optional plus)**: "If zkVerify makes an important claim checkable…" | 15 | Three checkable claims: payment (zkTLS, Reclaim), policy (Groth16 on zkVerify mainnet + testnet), release (zkVerify aggregation checked on Base Sepolia). Plus evidence: zkVerify's TEE pallet verified a NEAR AI TDX quote (integration evidence, not a claim about Provia's agent) |
| **Bonus**: public share | 5 | X thread with #AgentGames and @ZKVProtocol (also the Creator Track entry) |

Creator Track criteria: "Technical substance · Clarity · zkVerify relevance · Originality."

## 2. Originality: do not clone these
- **Mandate Bounty Agent:** zkTLS GitHub + Groth16 bounty payouts.
- **Elenchos:** auditor of zkVerify consumers.
- **ReserveRail / OATHKEEPER / AEGIS:** agent spend-policy proofs.
- **meshackyaro/TrueAlert:** buyers pay crypto instead of fiat.
- **ZKP2P:** US/EU rails, not an agent, no zkVerify.
- **Beanstick:** simulated zkTLS.

Provia's differences: real zkTLS on a fiat rail, every claim verified **on zkVerify**, zkVerify's aggregation verified on-chain by the escrow itself, and an attack-first demo.

## 3. Live-verified facts (re-check with `/verify-chain`; dates are verification dates)
- zkVerify mainnet `wss://zkverify-rpc.zkverify.io` (spec 2000000) and Volta `wss://volta-rpc.zkverify.io` (spec 2001000) both run `settlementTeePallet`. Verified 2026-11-19.
- **TEE on mainnet does not work.** Its CRL has no CAs registered. Volta has `Intel_SGX_Processor` registered, and TDX quotes chained via "Intel SGX PCK Platform CA" verify (zkverifyjs fixture). The verifier rejects only `Revoked` TCB status and debug TDs. Verified 2026-11-19.
- Kurier: mainnet `https://api.kurier.xyz/api/v1`, testnet `https://api-testnet.kurier.xyz/api/v1`, free keys. Statuses: Queued → Valid → Submitted → IncludedInBlock → Finalized (→ AggregationPending → Aggregated with chainId).
- zkVerify proxy on Base Sepolia (84532): `0x0807C544D38aE7729f8798388d89Be6502A1e8A8`. `verifyProofAggregation(domainId, aggregationId, leaf, merklePath, leafCount, index)`.
- NEAR AI Cloud: `https://cloud-api.near.ai/v1`. `GET /v1/attestation/report?model=…&nonce=…` (needs a key) returns `signing_address, intel_quote, nvidia_payload`; `GET /v1/signature/{chat_id}`.
- Agent Games: HMAC-SHA256 `x-agent-games-signature` over the raw body, in and out. Preflight replies `{ok:true, protocolVersion:"v1"}`. 60 s deadline.
- More gotchas: `~/.claude/skills/zkverify/SKILL.md`.

## 4. Engineering invariants (PRD §5)
- No model decides. Deterministic code and proofs decide (zero budget: no paid inference).
- Fail closed.
- The contract rebuilds the leaf.
- Integer money only.
- Zero mock data.
- Secrets only in env.
- Never print or commit keys.
- No AI attribution in commits.

## 5. Commands
- `npm run circuits:build` / `npm run circuits:test`
- `npm run contracts:test`
- `npm run agent:dev`
- `npm run verify` runs typecheck, all tests and build. Run it before every commit.
- Slash commands: `/kickoff`, `/verify-chain`, `/submission-audit`.

## 6. Honesty rules
Every claim ships with its mechanism. Every number must match across README, UI, deck, video and form. Report test counts only after they pass. `evidence/claims.json` maps every public claim to tx hashes and files.
