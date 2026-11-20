# Pre-submission audit (2026-11-20)

Five independent reviews ran against the live deploy and the repository: a security review, a code review, two independent judges scoring the quoted Wildcard and Creator Track criteria, and a GAN evaluator driving the live site in a browser. Every finding below was either fixed or is listed as open with its owner.

## Fixed

| Finding | Source | Fix |
|---|---|---|
| A buyer could prove made-up payment fields with the public circuit, get the proof aggregated on zkVerify and call `release()` | Judge B | `release()` is agent-only; contract test `only the agent can release…`; escrow redeployed at `0x92C4a650CB874cB5d450765CEA619c3Dc49aeC79` |
| `SNARK_SCALAR_FIELD` was not the BN254 order, so the field range checks were too loose | Security | Correct constant; test rejects `r` and `r + 1` |
| `release()` had no deadline check | Judge B | Refuses after the deadline; test added |
| Aggregation domain supplied by the caller | Judge B | Pinned at deploy; test added |
| Rate limit keyed on a spoofable header; no global cap | Security, Code | Rightmost proxy hop, 30/hour global cap, limiter pruning |
| `/claim` had no concurrency cap and created receipts for any id | Security | Shared run cap, locked-trade precheck, in-flight reference reservation |
| Raw provider and RPC errors published in receipts | Security | Generic public line, detail logged server-side |
| Refund sweep could crash the server on an RPC blip | Code | Guarded, plus an `unhandledRejection` logger |
| No timeouts on Paystack and Kurier calls; one failed poll aborted a trade | Code | Request timeouts; status polling tolerates transient failures |
| Mainnet verification could hold a finished receipt for minutes | Code | 90 s grace once the release has landed |
| CORS reflected any origin; `/agent` body unbounded | Security | Origin pinned to the site; 64 KB cap |
| Mobile header lost its navigation | GAN evaluator | Scrollable mobile nav row |
| Stale receipt on a second run; duplicate runs on rapid clicks; leaked WebGL probe context | Code | Keyed receipt view, single-run guard, probe context released |
| Home page served placeholders to crawlers | Judge A | Live strip rendered on the server, refreshed every minute |
| Inconsistent timing claim (90 s vs minutes) | Judges A and B | "1 to 4 minutes" everywhere, matching measured runs |
| Unrelated TEE tile on the home page | Judge B | Removed (the evidence file stays in `evidence/`) |
| Claims that overstated the trust model | Judge B | README, SUBMISSION, THREAT_MODEL state the agent / circuit / contract split explicitly |
| Repository private | Judges A and B | Public after a full-history secret scan (27 commits, none found) |

## Verified after the fixes

- Contract: 13 tests. Agent: 35 tests and typecheck. Circuit: 10 tests.
- Live on the new escrow: honest trade released; forged, short, wrong-trade and replay refused with their typed codes.
- `npm run evidence:verify`: 19/19 checks pass against Base Sepolia and the public receipts.

## Open (owner: project owner)

- Agent Games registration and `AGENT_GAMES_HMAC_SECRET` on Render, so the signed preflight returns `{ok:true, protocolVersion:"v1"}`.
- Publish the walkthrough video and the X thread (#AgentGames, @ZKVProtocol), then link them in README and SUBMISSION.
