# Judges, start here: five minutes

| Time | Do | Look for |
|---|---|---|
| 0:00–0:30 | Open [provia-ten.vercel.app](https://provia-ten.vercel.app). Move the cursor over the alert | The lens shows what the processor returned under a forged screenshot: no such transaction, refused |
| 0:30–1:30 | Click **Try a forged payment** | A trade is locked on Base Sepolia (lock link), then refused with `NO_PAYMENT_AT_PSP`. The escrow is never asked to release |
| 1:30–2:30 | In the attack lab run **Short payment** and **Replay** | `AMOUNT_SHORT` after a real zkTLS proof of an underpayment; `REF_REUSED` for a payment that already released a trade |
| 2:30–4:00 | Run **Honest buyer** and watch the receipt | zkTLS proof, Groth16, zkVerify mainnet, zkVerify aggregation, then the release on Basescan, in 1 to 4 minutes |
| 4:00–5:00 | Verify it yourself: `npm ci && npm run evidence:verify` | 19 checks against Base Sepolia and the public receipts, no keys needed |

## What to judge

| Criterion (quoted) | Where it is |
|---|---|
| "Show a clear need, who the agent helps, and why its work matters." | Sellers in P2P crypto trades release funds against payment alerts, which are trivially forged. Provia replaces the alert with a proof |
| "Make it possible to understand what you built and see the agent in action." | Live attack lab on the home page; every run is a real trade with a public receipt |
| "Explain the workflow, key choices, and what the agent can and cannot do." | [How it works](https://provia-ten.vercel.app/how-it-works), [README](README.md), [THREAT_MODEL.md](THREAT_MODEL.md) |
| "If zkVerify makes an important claim checkable, explain how it helps." | The escrow pays only after `verifyProofAggregation` on the zkVerify proxy accepts a leaf the contract rebuilds itself. Every release proof is also verified on zkVerify mainnet |

## What the agent cannot do

- Release funds on its own judgement: it releases only with a zkVerify-attested proof, and the contract checks it.
- Send funds anywhere but the recipient recorded at lock time.
- Release twice for one payment: the nullifier is `Poseidon(reference)`, burned on release.
- Accept a caller-supplied leaf: the contract recomputes it.
- Move real money: Base Sepolia test USDC and the processor's test mode only.
