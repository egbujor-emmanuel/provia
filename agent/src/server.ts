// Provia agent service: Agent Games endpoint (/agent), trade claims, demo scenarios and receipts.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { handleAgentGames } from './agent-games.ts';
import { SIGNATURE_HEADER } from './hmac.ts';
import { Chain, DEPLOYMENT } from './chain.ts';
import { KurierClient, AGGREGATION_DOMAIN, BASE_SEPOLIA_CHAIN_ID } from './kurier.ts';
import { ReceiptStore } from './receipts.ts';
import { runClaim } from './pipeline.ts';
import { SCENARIOS, isScenario, startScenario, demoBuyer, DEMO_PRICE_KOBO, DEMO_TOKEN_UNITS, type DemoContext } from './demo.ts';
import { REFUSALS } from './refusals.ts';
import { RateLimiter } from './rate-limit.ts';

const env = process.env;
const here = dirname(fileURLToPath(import.meta.url));
const store = new ReceiptStore(env.RECEIPTS_DIR ?? join(here, '..', 'data', 'receipts'));
const chain = new Chain(env.DEPLOYER_PRIVATE_KEY);

const ctx: DemoContext | null =
  env.DEPLOYER_PRIVATE_KEY && env.KURIER_API_KEY_TESTNET
    ? {
        chain,
        store,
        kurierTestnet: new KurierClient('testnet', env.KURIER_API_KEY_TESTNET),
        kurierMainnet: env.KURIER_API_KEY_MAINNET ? new KurierClient('mainnet', env.KURIER_API_KEY_MAINNET) : null,
        vkHash: DEPLOYMENT.constructor.vkHash,
        reclaimOrgToken: env.RECLAIM_ORG_TOKEN,
        paystackKey: env.PAYSTACK_SECRET_KEY,
        usedReferences: new Set<string>(),
        deployerKey: env.DEPLOYER_PRIVATE_KEY,
        lastReleasedReference: null,
      }
    : null;

// Restore the replay target from the newest released honest receipt.
if (ctx) {
  const released = store.list(500).find((r) => r.scenario === 'honest' && r.outcome === 'released');
  const ref = released?.steps.find((s) => s.key === 'claim')?.detail?.replace(/^reference /, '');
  if (ref) ctx.lastReleasedReference = ref;
}

const demoLimiter = new RateLimiter({ perWindow: 6, windowMs: 60 * 60_000 });
let demoRunning = 0;
const MAX_CONCURRENT_DEMOS = 2;

const app = new Hono();
app.use('/api/*', cors({ origin: (o) => o ?? '*', allowMethods: ['GET', 'POST'] }));

app.get('/health', (c) => c.json({ ok: true }));

// Agent Games: HMAC over the raw body, verified before parsing; every authenticated reply signed.
app.post('/agent', async (c) => {
  const raw = await c.req.text();
  const out = handleAgentGames(raw, c.req.header(SIGNATURE_HEADER), env.AGENT_GAMES_HMAC_SECRET);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (out.signature) headers[SIGNATURE_HEADER] = out.signature;
  return new Response(out.body, { status: out.status, headers });
});

app.get('/api/config', (c) =>
  c.json({
    escrow: { address: DEPLOYMENT.address, chainId: DEPLOYMENT.chainId, explorer: `https://sepolia.basescan.org/address/${DEPLOYMENT.address}` },
    zkVerify: { vkHash: DEPLOYMENT.constructor.vkHash, proxy: DEPLOYMENT.constructor.zkVerify, aggregationDomain: AGGREGATION_DOMAIN.baseSepolia, aggregationChainId: BASE_SEPOLIA_CHAIN_ID },
    token: { address: DEPLOYMENT.constructor.token, symbol: 'USDC', decimals: 6, network: 'Base Sepolia (test)' },
    demo: { priceKobo: DEMO_PRICE_KOBO.toString(), tokenUnits: DEMO_TOKEN_UNITS.toString(), buyer: env.DEPLOYER_PRIVATE_KEY ? demoBuyer(env.DEPLOYER_PRIVATE_KEY).address : null, scenarios: SCENARIOS },
    refusals: REFUSALS,
    ready: {
      chain: Boolean(env.DEPLOYER_PRIVATE_KEY),
      kurier: Boolean(env.KURIER_API_KEY_TESTNET),
      kurierMainnet: Boolean(env.KURIER_API_KEY_MAINNET),
      paystack: Boolean(env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')),
      zkTls: Boolean(env.RECLAIM_ORG_TOKEN?.startsWith('rorg_')),
      agentGames: Boolean(env.AGENT_GAMES_HMAC_SECRET),
    },
  }),
);

app.post('/api/demo/:scenario', async (c) => {
  const scenario = c.req.param('scenario');
  if (!isScenario(scenario)) return c.json({ error: 'unknown scenario', scenarios: Object.keys(SCENARIOS) }, 404);
  if (!ctx) return c.json({ error: 'agent is not configured for live trades' }, 503);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!demoLimiter.take(ip)) return c.json({ error: 'rate limited: 6 live demo trades per hour per visitor' }, 429);
  if (demoRunning >= MAX_CONCURRENT_DEMOS) return c.json({ error: 'demo trades are busy; try again in a minute' }, 429);
  demoRunning++;
  const receipt = await startScenario(ctx, scenario);
  const release = setInterval(() => {
    const r = store.get(receipt.id);
    if (!r || r.outcome !== 'pending') {
      demoRunning--;
      clearInterval(release);
    }
  }, 2_000);
  return c.json({ receiptId: receipt.id, tradeId: receipt.tradeId }, 202);
});

const claimBody = z.object({ message: z.string().min(1).max(2_000) });

app.post('/api/trades/:tradeId/claim', async (c) => {
  if (!ctx) return c.json({ error: 'agent is not configured for live trades' }, 503);
  const id = c.req.param('tradeId');
  if (!/^[1-9][0-9]{0,40}$/.test(id)) return c.json({ error: 'tradeId must be a positive integer' }, 400);
  const parsed = claimBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'body must be {"message": "..."}' }, 400);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!demoLimiter.take(ip)) return c.json({ error: 'rate limited' }, 429);
  const receipt = store.create(BigInt(id), 'claim');
  void runClaim(ctx, receipt, parsed.data.message);
  return c.json({ receiptId: receipt.id, tradeId: id }, 202);
});

app.get('/api/trades/:tradeId', async (c) => {
  const id = c.req.param('tradeId');
  if (!/^[1-9][0-9]{0,40}$/.test(id)) return c.json({ error: 'tradeId must be a positive integer' }, 400);
  const t = await chain.getTrade(BigInt(id));
  return c.json({ ...t, tradeId: id, tokenAmount: t.tokenAmount.toString(), priceKobo: t.priceKobo.toString(), deadline: t.deadline.toString() });
});

app.get('/api/receipts', (c) => c.json(store.list(50).map(({ id, tradeId, scenario, outcome, refusal, createdAt, updatedAt }) => ({ id, tradeId, scenario, outcome, refusal, createdAt, updatedAt }))));

app.get('/api/receipts/:id', (c) => {
  const r = store.get(c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => process.stdout.write(`provia agent listening on :${info.port}\n`));

// Render's free plan sleeps a service after 15 minutes without inbound requests, and a cold start
// would miss Agent Games' 60 s deadline. A request to our own public URL goes through Render's
// router, so it counts as inbound traffic and keeps the agent awake.
const KEEP_AWAKE_MS = 10 * 60_000;
const publicUrl = env.RENDER_EXTERNAL_URL ?? env.PUBLIC_URL;
if (publicUrl) {
  setInterval(() => {
    fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(20_000) }).catch((e: unknown) => {
      process.stderr.write(`keep-awake ping failed: ${(e as Error).message}\n`);
    });
  }, KEEP_AWAKE_MS).unref();
}

export { app };
