// Returns test USDC from demo trades that were refused (or errored) once their deadline passes.
// Run from repo root: node --env-file=.env agent/scripts/refund-expired.ts
import { Chain } from '../src/chain.ts';

const AGENT = process.env.AGENT_URL ?? 'https://provia-ch7d.onrender.com';
const chain = new Chain(process.env.DEPLOYER_PRIVATE_KEY);
const receipts = (await (await fetch(`${AGENT}/api/receipts`)).json()) as { tradeId: string; outcome: string }[];
const now = await chain.latestTimestamp();
let refunded = 0;

for (const r of receipts) {
  if (r.outcome === 'released' || r.outcome === 'pending') continue;
  const trade = await chain.getTrade(BigInt(r.tradeId));
  if (trade.state !== 'Locked' || trade.seller.toLowerCase() !== chain.signerAddress?.toLowerCase()) continue;
  if (now <= trade.deadline) {
    process.stdout.write(`trade ${r.tradeId}: locked until ${new Date(Number(trade.deadline) * 1000).toISOString()}\n`);
    continue;
  }
  const tx = await chain.refund(trade.tradeId);
  refunded++;
  process.stdout.write(`trade ${r.tradeId}: refunded ${trade.tokenAmount} units, ${tx.url}\n`);
}
process.stdout.write(`done, ${refunded} refunded\n`);
process.exit(0);
