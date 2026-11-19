# Provia

**Crypto escrow that releases only on a verified payment proof.**

[Live site](https://provia-ten.vercel.app) · [Agent API](https://provia-ch7d.onrender.com/api/config) · [Public receipts](https://provia-ten.vercel.app/receipts) · [How it works](https://provia-ten.vercel.app/how-it-works) · [Judges, start here](JUDGES.md)

In a peer-to-peer trade, the seller of crypto usually releases it after looking at a payment alert, and alerts are easy to fake. Provia removes that step. The crypto waits in a contract. The agent proves what the payment processor's own API returned (zkTLS), proves the trade rules hold (Groth16, verified on zkVerify), and the contract itself checks zkVerify's attestation before paying out. No model, person or picture decides.

Built for the zkVerify Agent Games (Wildcard track).

## Try it in two minutes, no wallet

| Step | What to do | What you should see |
|---|---|---|
| 1 | Open [provia-ten.vercel.app](https://provia-ten.vercel.app) | Live Base Sepolia block height, the escrow address and the agent's latest receipt along the bottom |
| 2 | Click **Try a forged payment** | A real trade is locked on Base Sepolia, then refused in about 20 s with `NO_PAYMENT_AT_PSP`. No funds move |
| 3 | In the attack lab, run **Short payment**, **Someone else's payment**, **Replay** | Refused with `AMOUNT_SHORT`, `TRADE_MISMATCH`, `REF_REUSED` |
| 4 | Run **Honest buyer** | Paid on Base Sepolia in about 90 s. The receipt links the lock, both zkVerify transactions and the release |
| 5 | Open any receipt | Every step, its timing, and links to Basescan and zkVerify Subscan |

Or from a terminal, against the live agent:

```bash
curl -X POST https://provia-ch7d.onrender.com/api/demo/forged-screenshot
# → {"receiptId":"…","tradeId":"…"}
curl https://provia-ch7d.onrender.com/api/receipts/<receiptId>
```

Check every public claim yourself, without keys:

```bash
npm ci && npm run evidence:verify   # 19 on-chain and receipt checks
```

## What happens in a release

```
seller locks USDC ──► ProviaEscrow (Base Sepolia)
buyer pays fiat ───► payment processor (Paystack test mode; trade id in metadata)
buyer: "I've paid, ref X" ─► agent
   1. reads the trade from the escrow; refuses if not locked
   2. parses the reference from the buyer's words (deterministic, no model)
   3. nullifier = Poseidon(reference); refuses if already used
   4. zkTLS (Reclaim): proves the processor's verify response: status, amount, currency, paid_at, trade id
      → verified with Reclaim's official verifier against Reclaim's published attestor set
   5. release policy in code; refuses with a typed code on any mismatch
   6. Groth16 proof of release_policy.circom (same rules, binding the zkTLS fields via claimCommit)
   7. Kurier → zkVerify mainnet (finality)  and  zkVerify testnet → aggregated to Base Sepolia
   8. ProviaEscrow.release(): rebuilds the leaf from its own trade data + vkHash,
      calls verifyProofAggregation on the zkVerify proxy, burns the nullifier, pays the recorded buyer
```

Any error, timeout or mismatch ends in a refusal. The escrow is never asked to release unless every step passed.

## Why zkVerify is essential

Without zkVerify, the escrow would have to trust the agent's word that a payment cleared. With it, the contract checks a zkVerify attestation for a proof whose public inputs it recomputes itself (trade id, recipient, price, deadline, nullifier, claim commitment). A compromised agent cannot release funds for a payment it cannot prove. No proof, no release; no aggregation, no release.

## Proof it runs

The first live trade on the deployed agent ([receipt](https://provia-ch7d.onrender.com/api/receipts/3cf7a978-730b-42a1-a54c-9ec77c743eda)):

| Step | Link |
|---|---|
| Lock 0.05 test USDC | [Basescan](https://sepolia.basescan.org/tx/0xe37391cec2221d32228f1996a9243fd386c27e69ad375f259b36dec6be5f13ff) |
| Groth16 proof verified on zkVerify mainnet | [Subscan](https://zkverify.subscan.io/extrinsic/0x1e11a7dc810b63166a0beaa0f7958baa3a1375e972da87bc752f3510d8277905) |
| Verified and aggregated on zkVerify testnet (aggregation 66999) | [Subscan](https://zkverify-testnet.subscan.io/extrinsic/0x3214d4232db24fd03d8b95630572fd84f3536f15234cd60a24f7fdfd611e3e2a) |
| Escrow release to the buyer | [Basescan](https://sepolia.basescan.org/tx/0x9b083be9e004417e3acd9aafdf9a90821fa94a3bc8c3a31aa595b6d5aef61746) |

All four attacks were refused on the same deployment; their receipts are in [evidence/claims.json](evidence/claims.json).

| Contract | Address |
|---|---|
| ProviaEscrow (Base Sepolia) | [`0x2786C763748BED21787916D8EC766F1Cde929a26`](https://sepolia.basescan.org/address/0x2786C763748BED21787916D8EC766F1Cde929a26) |
| zkVerify proxy (Base Sepolia) | `0x0807C544D38aE7729f8798388d89Be6502A1e8A8` |
| Release-policy vkHash (registered on Kurier testnet and mainnet) | `0x23abe0175caa02a03514d25fb4812e6ef5f2cee9a9f03800cafae54735446e14` |

## Tests

`npm run verify` runs the agent typecheck and 55 tests: 10 circuit, 10 contract, 35 agent. Each attack class has a named test at every layer; see [THREAT_MODEL.md](THREAT_MODEL.md).

## Repository

| Path | What |
|---|---|
| `circuits/` | `release_policy.circom` (Groth16/BN128), frozen proving artifacts |
| `contracts/` | `ProviaEscrow.sol` (Hardhat) |
| `agent/` | Node/TypeScript agent: trade API, release pipeline, zkTLS, prover, Kurier, Agent Games endpoint |
| `web/` | Next.js site: live escrow data, the truth lens, attack lab, receipts |
| `evidence/` | Deployment, spike results, live runs, `claims.json` |

For agents and AI judges: [`/llms.txt`](https://provia-ten.vercel.app/llms.txt), [`/api/openapi.json`](https://provia-ten.vercel.app/api/openapi.json). The zkVerify Agent Games endpoint is `POST https://provia-ch7d.onrender.com/agent` (HMAC-SHA256 over the raw body).

More: [JUDGES.md](JUDGES.md) · [THREAT_MODEL.md](THREAT_MODEL.md) · [REPRODUCE.md](REPRODUCE.md) · [SUBMISSION.md](SUBMISSION.md)
