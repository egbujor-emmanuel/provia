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
import { runClaim, serialised as serialisedWrite } from './pipeline.ts';
import { SCENARIOS, isScenario, startScenario, demoBuyer, DEMO_PRICE_KOBO, DEMO_TOKEN_UNITS, type DemoContext } from './demo.ts';
import { REFUSALS } from './refusals.ts';
import { RateLimiter } from './rate-limit.ts';
import { HfReceiptMirror } from './hf-store.ts';

const env = process.env;
const here = dirname(fileURLToPath(import.meta.url));
const store = new ReceiptStore(env.RECEIPTS_DIR ?? join(here, '..', 'data', 'receipts'));
const chain = new Chain(env.DEPLOYER_PRIVATE_KEY);

// Durable receipts: restore finished receipts from the Hugging Face dataset, then mirror new ones.
if (env.HF_TOKEN && env.HF_RECEIPTS_REPO) {
  const mirror = new HfReceiptMirror(env.HF_RECEIPTS_REPO, env.HF_TOKEN);
  try {
    const restored = store.restore(await mirror.loadAll());
    process.stdout.write(`restored ${restored} receipts from ${mirror.repoName}
`);
  } catch (e) {
    process.stderr.write(`could not restore receipts: ${(e as Error).message}
`);
  }
  store.setMirror(mirror);
}

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

const HOUR_MS = 60 * 60_000;
const demoLimiter = new RateLimiter({ perWindow: 6, windowMs: HOUR_MS });
/** One bucket for everyone: caps total spend even if per-visitor keys are spoofed. */
const globalLimiter = new RateLimiter({ perWindow: 30, windowMs: HOUR_MS });
const readLimiter = new RateLimiter({ perWindow: 120, windowMs: 60_000 });
let demoRunning = 0;
const MAX_CONCURRENT_RUNS = 2;
/** A run that never settles must not hold its slot forever. */
const RUN_SLOT_TIMEOUT_MS = 30 * 60_000;
const MAX_AGENT_BODY_BYTES = 64 * 1024;
const WEB_ORIGINS = new Set([env.WEB_ORIGIN ?? 'https://provia-ten.vercel.app', 'http://localhost:3000']);

/**
 * Client address for rate limiting. Render's proxy appends the connecting address to
 * X-Forwarded-For, so the rightmost entry is the one a client cannot forge.
 */
function clientKey(header: string | undefined): string {
  const parts = (header ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? 'local';
}

/** Hold a run slot until the receipt settles or the timeout passes, whichever is first. */
function holdSlot(receiptId: string): void {
  demoRunning++;
  const started = Date.now();
  const timer = setInterval(() => {
    const r = store.get(receiptId);
    if (!r || r.outcome !== 'pending' || Date.now() - started > RUN_SLOT_TIMEOUT_MS) {
      demoRunning = Math.max(0, demoRunning - 1);
      clearInterval(timer);
    }
  }, 2_000);
  timer.unref();
}

const app = new Hono();
app.use('/api/*', cors({ origin: (o) => (WEB_ORIGINS.has(o) ? o : 'https://provia-ten.vercel.app'), allowMethods: ['GET', 'POST'] }));

app.get('/health', (c) => c.json({ ok: true }));

// Agent Games: HMAC over the raw body, verified before parsing; every authenticated reply signed.
app.post('/agent', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > MAX_AGENT_BODY_BYTES) return c.json({ error: 'body too large' }, 413);
  const raw = await c.req.text();
  if (raw.length > MAX_AGENT_BODY_BYTES) return c.json({ error: 'body too large' }, 413);
  const out = handleAgentGames(raw, c.req.header(SIGNATURE_HEADER), env.AGENT_GAMES_HMAC_SECRET);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (out.signature) headers[SIGNATURE_HEADER] = out.signature;
  return new Response(out.body, { status: out.status, headers });
});

/** Deployer gas, cached for a minute: enough for ~100 trades at Base Sepolia's real fee. */
const MIN_GAS_WEI = 20_000_000_000_000n; // 0.00002 ETH
let gasCache: { at: number; ok: boolean; wei: string } | null = null;
async function gasStatus(): Promise<{ ok: boolean; wei: string }> {
  if (gasCache && Date.now() - gasCache.at < 60_000) return gasCache;
  try {
    const addr = chain.signerAddress;
    if (!addr) return { ok: false, wei: '0' };
    const wei = BigInt((await chain.provider.getBalance(addr)).toString());
    gasCache = { at: Date.now(), ok: wei >= MIN_GAS_WEI, wei: wei.toString() };
    return gasCache;
  } catch {
    return { ok: false, wei: 'unavailable' };
  }
}

app.get('/api/config', async (c) => {
  const gas = await gasStatus();
  return c.json({
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
      gas: gas.ok,
    },
    deployerGasWei: gas.wei,
  });
});

app.post('/api/demo/:scenario', async (c) => {
  const scenario = c.req.param('scenario');
  if (!isScenario(scenario)) return c.json({ error: 'unknown scenario', scenarios: Object.keys(SCENARIOS) }, 404);
  if (!ctx) return c.json({ error: 'agent is not configured for live trades' }, 503);
  if (demoRunning >= MAX_CONCURRENT_RUNS) return c.json({ error: 'demo trades are busy; try again in a minute' }, 429);
  if (!demoLimiter.take(clientKey(c.req.header('x-forwarded-for')))) return c.json({ error: 'rate limited: 6 live demo trades per hour per visitor' }, 429);
  if (!globalLimiter.take('all')) return c.json({ error: 'the live demo has hit its hourly limit; try again later' }, 429);
  const gas = await gasStatus();
  if (!gas.ok) return c.json({ error: 'demo paused: the demo wallet is low on test gas' }, 503);
  const receipt = await startScenario(ctx, scenario);
  holdSlot(receipt.id);
  return c.json({ receiptId: receipt.id, tradeId: receipt.tradeId }, 202);
});

const claimBody = z.object({ message: z.string().min(1).max(2_000) });

app.post('/api/trades/:tradeId/claim', async (c) => {
  if (!ctx) return c.json({ error: 'agent is not configured for live trades' }, 503);
  const id = c.req.param('tradeId');
  if (!/^[1-9][0-9]{0,40}$/.test(id)) return c.json({ error: 'tradeId must be a positive integer' }, 400);
  const parsed = claimBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'body must be {"message": "..."}' }, 400);
  if (demoRunning >= MAX_CONCURRENT_RUNS) return c.json({ error: 'busy; try again in a minute' }, 429);
  if (!demoLimiter.take(clientKey(c.req.header('x-forwarded-for')))) return c.json({ error: 'rate limited' }, 429);
  if (!globalLimiter.take('all')) return c.json({ error: 'hourly limit reached; try again later' }, 429);
  // Only locked trades get a receipt: no receipts (or proving work) for arbitrary ids.
  const trade = await chain.getTrade(BigInt(id)).catch(() => null);
  if (!trade || trade.state !== 'Locked') return c.json({ error: 'trade is not locked in the escrow', code: 'TRADE_NOT_LOCKED' }, 409);
  const receipt = store.create(BigInt(id), 'claim');
  holdSlot(receipt.id);
  void runClaim(ctx, receipt, parsed.data.message);
  return c.json({ receiptId: receipt.id, tradeId: id }, 202);
});

app.get('/api/trades/:tradeId', async (c) => {
  if (!readLimiter.take(clientKey(c.req.header('x-forwarded-for')))) return c.json({ error: 'rate limited' }, 429);
  const id = c.req.param('tradeId');
  if (!/^[1-9][0-9]{0,40}$/.test(id)) return c.json({ error: 'tradeId must be a positive integer' }, 400);
  const t = await chain.getTrade(BigInt(id));
  return c.json({ ...t, tradeId: id, tokenAmount: t.tokenAmount.toString(), priceKobo: t.priceKobo.toString(), deadline: t.deadline.toString() });
});

app.get('/api/receipts', (c) => c.json(store.list(60).filter((r) => r.scenario !== 'setup-check').slice(0, 50).map(({ id, tradeId, scenario, outcome, refusal, createdAt, updatedAt }) => ({ id, tradeId, scenario, outcome, refusal, createdAt, updatedAt }))));

app.get('/api/receipts/:id', (c) => {
  const r = store.get(c.req.param('id'));
  return r ? c.json(r) : c.json({ error: 'not found' }, 404);
});


// Refused demo trades keep their test USDC locked until the deadline; sweep them back every
// 30 minutes so the demo wallet stays funded for judges over weeks.
const REFUND_SWEEP_MS = 30 * 60_000;
async function refundSweep(): Promise<void> {
  if (!ctx) return;
  let now: bigint;
  try {
    now = await chain.latestTimestamp();
  } catch (e) {
    process.stderr.write(`refund sweep skipped: ${(e as Error).message.slice(0, 120)}\n`);
    return;
  }
  for (const r of store.list(500)) {
    if (r.outcome === 'released' || r.outcome === 'pending') continue;
    try {
      const t = await chain.getTrade(BigInt(r.tradeId));
      if (t.state !== 'Locked' || now <= t.deadline || t.seller.toLowerCase() !== chain.signerAddress?.toLowerCase()) continue;
      const tx = await serialisedWrite(() => chain.refund(t.tradeId));
      process.stdout.write(`refunded expired trade ${r.tradeId}: ${tx.url}
`);
    } catch (e) {
      process.stderr.write(`refund sweep skipped ${r.tradeId}: ${(e as Error).message.slice(0, 120)}
`);
    }
  }
}
setInterval(() => void refundSweep(), REFUND_SWEEP_MS).unref();

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`unhandled rejection: ${String((reason as Error)?.message ?? reason).slice(0, 300)}\n`);
});

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => process.stdout.write(`provia agent listening on :${info.port}\n`));

// Free hosts sleep idle services (Hugging Face after 48 h, Render after 15 min), and a cold start
// would miss Agent Games' 60 s deadline. A request to our own public URL goes through the host's
// router, so it counts as inbound traffic and keeps the agent awake.
const KEEP_AWAKE_MS = 10 * 60_000;
const publicUrl = env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? (env.SPACE_HOST ? `https://${env.SPACE_HOST}` : undefined);
if (publicUrl) {
  setInterval(() => {
    fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(20_000) }).catch((e: unknown) => {
      process.stderr.write(`keep-awake ping failed: ${(e as Error).message}\n`);
    });
  }, KEEP_AWAKE_MS).unref();
}

export { app };
