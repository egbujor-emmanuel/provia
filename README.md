# Provia

**Crypto escrow that releases only on a verified payment proof.**

[Live site](https://provia-ten.vercel.app) · [Agent API](https://provia-ch7d.onrender.com/api/config) · [Public receipts](https://provia-ten.vercel.app/receipts) · [How it works](https://provia-ten.vercel.app/how-it-works) · [Judges, start here](JUDGES.md)

In a peer-to-peer trade, the seller of crypto usually releases it after looking at a payment alert, and alerts are easy to fake. Provia removes that step. The crypto waits in a contract. The agent proves what the payment processor's own API returned (zkTLS), proves the trade rules hold (Groth16, verified on zkVerify), and the contract checks zkVerify's attestation before paying out. No model, person or picture decides.

Built for the zkVerify Agent Games (Wildcard track).

## Try it in two minutes, no wallet

| Step | What to do | What you should see |
|---|---|---|
| 1 | Open [provia-ten.vercel.app](https://provia-ten.vercel.app) | Live Base Sepolia block height, the escrow address and the agent's latest receipt along the bottom |
| 2 | Click **Try a forged payment** | A real trade is locked on Base Sepolia, then refused within seconds with `NO_PAYMENT_AT_PSP`. No funds move |
| 3 | In the attack lab, run **Short payment**, **Someone else's payment**, **Replay** | Refused with `AMOUNT_SHORT`, `TRADE_MISMATCH`, `REF_REUSED` |
| 4 | Run **Honest buyer** | Paid on Base Sepolia in 1 to 4 minutes (the wait is zkVerify's aggregation reaching Base Sepolia). The receipt links the lock, both zkVerify transactions and the release |
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

## Why zkVerify is essential, and what is trusted

The contract never takes a picture or a person's word. It pays only when zkVerify attests a Groth16 proof whose public inputs the contract recomputes itself: trade id, recipient, price, deadline, the one-time nullifier and the claim commitment. No attested proof, no release.

The trust split is explicit:

| Who | Checks |
|---|---|
| The agent (the only address allowed to call `release`) | The zkTLS proof of the payment processor's response, verified with Reclaim's official verifier against Reclaim's published attestors, before it proves anything |
| The Groth16 circuit, verified on zkVerify | Payment succeeded, trade currency, paid ≥ price, paid before the deadline, bound to this trade and buyer; `claimCommit` ties the proof to the zkTLS-revealed fields |
| `ProviaEscrow`, on-chain | zkVerify's aggregation for the leaf it rebuilds itself, the recipient, the price, the deadline, the nullifier (one payment, one release), the aggregation domain, and that the caller is the agent |

So even the agent cannot pay a different address, accept a lower price or a late payment, or use one payment twice. The agent is trusted for one thing only: that the zkTLS proof it checked was valid.

## Proof it runs

A live honest trade on the current escrow ([receipt](https://provia-ch7d.onrender.com/api/receipts/0b660521-cecc-41a1-adb8-931c0ec005a4)):

| Step | Link |
|---|---|
| Lock 0.05 test USDC | [Basescan](https://sepolia.basescan.org/tx/0x097c4084cba8497ee58797c8eb7f4d1542b21680a973941f9a407c9ae9725792) |
| Groth16 proof verified on zkVerify mainnet | [Subscan](https://zkverify.subscan.io/extrinsic/0x63b3962731b091746017fb4a80c5d2180ccd9f29d86dc4d0f3d0eef38c2929b1) |
| Verified and aggregated on zkVerify testnet (aggregation 67287) | [Subscan](https://zkverify-testnet.subscan.io/extrinsic/0x6ba14ea7701a6e4a6a075d509f5e20c367f05511abfb1cec371b1096f9af55d8) |
| Escrow release to the buyer (sent by the agent) | [Basescan](https://sepolia.basescan.org/tx/0x19ff297143d46eece014b0fbc37b962265ab43de5fde14496cc7b27879ca27cb) |

All four attacks were refused on the same escrow; their receipts are in [evidence/claims.json](evidence/claims.json). An earlier escrow (`0x2786…9a26`, before the agent-only release fix) is recorded in `evidence/deployment-base-sepolia-v1.json`.

| Contract | Address |
|---|---|
| ProviaEscrow (Base Sepolia) | [`0x92C4a650CB874cB5d450765CEA619c3Dc49aeC79`](https://sepolia.basescan.org/address/0x92C4a650CB874cB5d450765CEA619c3Dc49aeC79) |
| zkVerify proxy (Base Sepolia) | `0x0807C544D38aE7729f8798388d89Be6502A1e8A8` |
| Release-policy vkHash (registered on Kurier testnet and mainnet) | `0x23abe0175caa02a03514d25fb4812e6ef5f2cee9a9f03800cafae54735446e14` |

## Tests

`npm run verify` runs the agent typecheck and 58 tests: 10 circuit, 13 contract, 35 agent. Each attack class has a named test at every layer; see [THREAT_MODEL.md](THREAT_MODEL.md).

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
