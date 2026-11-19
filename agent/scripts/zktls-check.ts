// Linux check of Reclaim zkFetch modes against a real Paystack test transaction.
// MODE=tee : one TEE-mode proof revealing all five fields (Reclaim's TEE attestors do the work).
// MODE=split : one small ZK proof per field, verified with Reclaim's official verifier.
// Usage: MODE=tee REFERENCE=<ref> TRADE_ID=<id> node agent/scripts/zktls-check.ts
import { writeFileSync } from 'node:fs';
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { REVEALED_FIELDS, verifyUrl, contextMessage, provePaystackTransaction, claimFromProofs } from '../src/zktls.ts';

const mode = process.env.MODE ?? 'tee';
const reference = process.env.REFERENCE ?? 'vgrzv1uk5extoun';
const tradeId = BigInt(process.env.TRADE_ID ?? '1');
const contextAddress = process.env.CONTEXT_ADDRESS ?? '0x1755E7CA81a3a907bB15637fD40Eb874ADb9815f';
const say = (m: string) => process.stdout.write(`${m}\n`);
const t0 = Date.now();

try {
  if (mode === 'tee') {
    const client = new ReclaimClient({ orgToken: process.env.RECLAIM_ORG_TOKEN!, retries: 2 });
    const proof = await client.zkFetch(
      verifyUrl(reference),
      { method: 'GET', useTee: true, context: { contextAddress, contextMessage: contextMessage(tradeId) } },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        responseMatches: REVEALED_FIELDS.map((f) => ({ type: 'regex' as const, value: f.regex })),
        responseRedactions: REVEALED_FIELDS.map((f) => ({ jsonPath: f.jsonPath, regex: f.regex })),
      },
    );
    const blob = JSON.stringify(proof);
    say(`TEE proof OK in ${Date.now() - t0} ms; keys ${Object.keys(proof).join(',')}`);
    say(`extracted ${JSON.stringify(proof.extractedParameterValues)}`);
    say(`witnesses ${JSON.stringify(proof.witnesses)}`);
    say(`secret leaked: ${blob.includes(process.env.PAYSTACK_SECRET_KEY!)}`);
    writeFileSync('zktls-proof.json', JSON.stringify({ ...proof }, null, 2));
  } else {
    const proofs = await provePaystackTransaction({
      reference,
      tradeId,
      contextAddress,
      orgToken: process.env.RECLAIM_ORG_TOKEN,
      paystackKey: process.env.PAYSTACK_SECRET_KEY,
      onField: (f, ms) => say(`field ${f} proved in ${ms} ms`),
    });
    const claim = await claimFromProofs(proofs, { reference, tradeId, contextAddress });
    say(`SPLIT verified in ${Date.now() - t0} ms: ${JSON.stringify(claim, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
    writeFileSync('zktls-proof.json', JSON.stringify(proofs, null, 2));
  }
} catch (e) {
  say(`FAIL (${mode}) after ${Date.now() - t0} ms: ${(e as Error).name}: ${(e as Error).message.slice(0, 400)}`);
  process.exitCode = 1;
}
process.exit();
