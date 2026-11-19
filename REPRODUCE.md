# Reproduce

## Check everything without keys

```bash
git clone https://github.com/egbujor-emmanuel/provia && cd provia
npm ci
npm run verify            # agent typecheck + 55 tests (10 circuit, 10 contract, 35 agent)
npm run evidence:verify   # 19 checks of the public claims against Base Sepolia and the live receipts
```

Requires Node 24. The circuit's proving artifacts are frozen in `circuits/artifacts/`; rebuilding them (`npm run circuits:build`) needs circom 2.2.3 and changes the vkHash.

## Run the agent yourself

Create `.env` at the repo root:

| Variable | Where it comes from (all free) |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Any Base Sepolia key with a little ETH and test USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) |
| `KURIER_API_KEY_TESTNET`, `KURIER_API_KEY_MAINNET` | [kurier.xyz](https://kurier.xyz) |
| `PAYSTACK_SECRET_KEY` | A Paystack test key (`sk_test_…`) |
| `RECLAIM_ORG_TOKEN` | Reclaim Builder organization token (`rorg_…`) |
| `AGENT_GAMES_HMAC_SECRET` | Agent Games dashboard, "Rotate Secret" (only for `/agent`) |

```bash
node --env-file=.env agent/src/server.ts      # http://localhost:8787
curl -X POST localhost:8787/api/demo/forged-screenshot
```

zkTLS uses Reclaim's TEE mode on Linux and macOS, and one proof per field elsewhere (`ZKTLS_MODE=tee|split`). The production image is the root `Dockerfile`.

## Run the site

```bash
cd web && npm ci
NEXT_PUBLIC_AGENT_URL=http://localhost:8787 npm run dev
```
