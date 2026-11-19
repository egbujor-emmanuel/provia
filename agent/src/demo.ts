// One-click scenarios for judges. Everything is real: a fresh trade is locked in the deployed
// escrow on Base Sepolia, the buyer pays with Paystack's test card (test mode, no real money),
// and the claim runs through the full pipeline. Attacks are real attempts that must be refused.
import { randomInt } from 'node:crypto';
import { ethers } from 'ethers';
import { payWithTestCard } from './paystack.ts';
import { runClaim, serialised, type PipelineDeps } from './pipeline.ts';
import type { Receipt } from './receipts.ts';

export const SCENARIOS = {
  honest: 'Buyer pays the full price on time, then claims',
  'forged-screenshot': 'Buyer claims with a made-up reference (the forged-receipt scam)',
  'short-payment': 'Buyer pays less than the price, then claims',
  'wrong-trade': "Buyer pays for a different trade and claims this one",
  replay: 'Buyer reuses a payment that already released a trade',
} as const;
export type Scenario = keyof typeof SCENARIOS;

export const DEMO_PRICE_KOBO = 150_000n; // ₦1,500.00
export const DEMO_TOKEN_UNITS = 50_000n; // 0.05 test USDC (6 decimals)
const DEMO_TRADE_TTL_S = 3_600n;

export function isScenario(s: string): s is Scenario {
  return Object.hasOwn(SCENARIOS, s);
}

/** Demo buyer address, derived from the deployer key so test USDC can be swept back. */
export function demoBuyer(deployerKey: string): ethers.Wallet {
  return new ethers.Wallet(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`provia-demo-buyer:${deployerKey}`)));
}

export function newTradeId(): bigint {
  return BigInt(Date.now()) * 1_000n + BigInt(randomInt(1_000));
}

export interface DemoContext extends PipelineDeps {
  readonly deployerKey: string;
  /** Reference of the most recent released honest payment, for the replay attack. */
  lastReleasedReference: string | null;
}

export async function startScenario(ctx: DemoContext, scenario: Scenario): Promise<Receipt> {
  const tradeId = newTradeId();
  const receipt = ctx.store.create(tradeId, scenario);
  void runScenario(ctx, scenario, tradeId, receipt);
  return receipt;
}

async function runScenario(ctx: DemoContext, scenario: Scenario, tradeId: bigint, receipt: Receipt): Promise<void> {
  const { store } = ctx;
  const setup = { key: 'setup', title: 'Seller locks test USDC; buyer acts', status: 'running' as const, startedAt: new Date().toISOString() };
  receipt.steps.push({ ...setup });
  const s = receipt.steps[receipt.steps.length - 1];
  store.save(receipt);
  let message: string;
  try {
    const recipient = demoBuyer(ctx.deployerKey).address;
    const deadline = (await ctx.chain.latestTimestamp()) + DEMO_TRADE_TTL_S;
    const lock = await serialised(() => ctx.chain.lock({ tradeId, recipient, tokenAmount: DEMO_TOKEN_UNITS, priceKobo: DEMO_PRICE_KOBO, deadline }));
    s.links = { lock: lock.url };
    s.data = { tradeId: tradeId.toString(), recipient, priceKobo: DEMO_PRICE_KOBO.toString(), tokenAmount: DEMO_TOKEN_UNITS.toString(), deadline: deadline.toString() };

    const pay = (amountKobo: bigint, forTrade: bigint) => payWithTestCard({ tradeId: forTrade, amountKobo, secretKey: ctx.paystackKey });
    switch (scenario) {
      case 'honest': {
        const ref = await pay(DEMO_PRICE_KOBO, tradeId);
        message = `Hi, I've sent the ₦1,500 for this trade. Ref: ${ref}`;
        break;
      }
      case 'forged-screenshot':
        message = `Paid ₦1,500 just now, here is my bank receipt screenshot. Reference: PSK-${randomInt(10_000_000, 99_999_999)}X`;
        break;
      case 'short-payment': {
        const ref = await pay(DEMO_PRICE_KOBO - 50_000n, tradeId);
        message = `Done, paid. Ref ${ref}`;
        break;
      }
      case 'wrong-trade': {
        const ref = await pay(DEMO_PRICE_KOBO, tradeId + 1n);
        message = `Payment sent, reference ${ref}`;
        break;
      }
      case 'replay': {
        if (!ctx.lastReleasedReference) throw new Error('run the honest scenario first; there is no released payment to replay yet');
        message = `I paid, reference ${ctx.lastReleasedReference}`;
        break;
      }
    }
    s.status = 'done';
    s.detail = `buyer says: “${message}”`;
  } catch (e) {
    s.status = 'error';
    s.detail = (e as Error).message.slice(0, 240);
    receipt.outcome = 'error';
    store.save(receipt);
    return;
  } finally {
    (s as { endedAt?: string }).endedAt = new Date().toISOString();
    store.save(receipt);
  }

  const done = await runClaim(ctx, receipt, message);
  if (scenario === 'honest' && done.outcome === 'released') {
    const claimStep = done.steps.find((x) => x.key === 'claim');
    ctx.lastReleasedReference = (claimStep?.detail ?? '').replace(/^reference /, '') || null;
  }
}
