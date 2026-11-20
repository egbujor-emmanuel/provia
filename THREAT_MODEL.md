# Threat model

Assets: test USDC locked in `ProviaEscrow`. Adversaries: a dishonest buyer, a third party calling the contract, a buggy agent.

| Attack | Defence | Named test(s) | Live run |
|---|---|---|---|
| Forged payment screenshot | The processor's own verify API is the source; the agent refuses before proving | agent `policy and circuit agree: every claim the policy refuses is also unprovable`; circuit `NO_PAYMENT_AT_PSP: a non-success status is unprovable` | `NO_PAYMENT_AT_PSP` ([claims.json](evidence/claims.json)) |
| Pays less than the price | Policy and circuit both require `paid ≥ price` (64-bit range-checked) | circuit `AMOUNT_SHORT: paying one kobo less is unprovable`, `field wrap-around cannot fake paidKobo >= priceKobo`; contract `a proof attested for a cheaper price cannot release this trade` | `AMOUNT_SHORT` |
| Pays for a different trade | Trade id is in the payment metadata, proven by zkTLS, bound into `claimCommit` and a public input | circuit `TRADE_MISMATCH: a claim committed to another trade is unprovable`; agent `zkTLS: the same proof is refused for another trade…` | `TRADE_MISMATCH` |
| Replays a payment that already released | `nullifier = Poseidon(reference)`, checked by the agent and burned by the contract | contract `REF_REUSED: one payment reference cannot release two trades` | `REF_REUSED` |
| Pays after the deadline | Circuit enforces `paidAt ≤ deadline`; contract refuses after expiry | circuit `PAID_AFTER_DEADLINE: paying one second late is unprovable`; agent `policy refuses with EXPIRED…` | |
| Wrong currency | Circuit pins the rail's ISO 4217 currency code | circuit `WRONG_CURRENCY: a USD (840) payment is unprovable` | |
| Edits a zkTLS-revealed value | Attestor signature over the claim breaks | agent `zkTLS: editing a revealed value breaks the attestor signature` | |
| zkTLS proof from an unknown attestor | Verified against Reclaim Builder's published attestor set | agent `zkTLS: …or an untrusted attestor` | |
| Caller-supplied leaf (Elenchos bug class) | `release()` takes no leaf; it rebuilds it from trade data and `vkHash` | contract `contract leaf equals the independently computed zkVerify leaf`, `refuses a release that zkVerify has not attested (forged claimCommit)` | |
| Release to a different address | Recipient is fixed at lock and is a public input; funds only go to the recipient | circuit `a proof does not verify against a changed recipient`; contract `releases to the recipient when zkVerify attests the rebuilt leaf` | |
| Buyer proves made-up payment fields with the public circuit and gets it aggregated | Only the agent (which verified the zkTLS proof) may call `release` | contract `only the agent can release: a buyer with a self-made attested proof is refused` | |
| Release after the deadline | `release` refuses after the deadline, so release and refund never overlap | contract `refuses a release after the deadline, so release and refund never overlap` | |
| Attestation from another aggregation domain | Domain pinned at deploy | contract `refuses an attestation from another aggregation domain` | |
| Double release or refund after release | State machine Locked → Released/Refunded | contract `a released trade cannot be released or refunded again` | |
| Seller pulls funds early | Refund only by the seller, only after the deadline | contract `refund: only the seller, only after the deadline` | |
| Out-of-field public inputs (aliasing a nullifier past the replay guard) | Contract rejects values ≥ the BN254 field order r | contract `rejects public inputs outside the SNARK field (r itself and r + 1)` | |
| Forged Agent Games request | HMAC-SHA256 over the raw body before parsing; unsigned 401 | agent `agent games: bad, missing or wrong-secret signatures get an unsigned 401` | |
| Agent misconfigured or a dependency down | Fail closed: every step wrapped; errors end in a refusal, writes simulated first | agent `agent games: no secret configured fails closed with 503`; pipeline refusals | first honest run on a misconfigured image refused `ZKTLS_INVALID`, no release |
| Secret leakage | Keys only in environment variables; never in receipts, logs or proofs | agent `kurier: client … never leaks the key in errors`; zkTLS secret headers never revealed | |

Trust assumptions: the agent, for checking the zkTLS proof before proving (it is the only address that can call `release`, and the contract still enforces recipient, price, deadline, replay and zkVerify's attestation); Reclaim's attestors (zkTLS); zkVerify's verifier and the aggregation relay to Base Sepolia; and the payment processor's API being honest about its own records.
