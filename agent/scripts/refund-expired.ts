// Returns test USDC from demo trades that were refused (or errored) once their deadline passes.
// Run from repo root: node --env-file=.env agent/scripts/refund-expired.ts
import { join } from 'node:path';
import { Chain } from '../src/chain.ts';
import { ReceiptStore } from '../src/receipts.ts';

const chain = new Chain(process.env.DEPLOYER_PRIVATE_KEY);
const store = new ReceiptStore(process.env.RECEIPTS_DIR ?? join('agent', 'data', 'receipts'));
const now = await chain.latestTimestamp();
let refunded = 0;

for (const r of store.list(1_000)) {
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
