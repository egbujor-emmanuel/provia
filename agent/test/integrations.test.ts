import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasReached, toAttestation, jobStatusSchema, KurierClient, KurierError } from '../src/kurier.ts';
import { parseTdxQuote, reportDataBinds, fmspcFromQuote, pckIssuer, pemChainFromQuote } from '../src/tee-quote.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nearai-model-attestation.json', import.meta.url), 'utf8'));

// Shape of a real Kurier testnet job (job f16b0bed-…, 2026-11-19), see evidence/g2-leaf-parity.json.
const aggregatedJob = jobStatusSchema.parse({
  jobId: 'f16b0bed-e42a-11f1-bb46-22f5290c9c2d',
  status: 'Aggregated',
  statusId: 6,
  proofType: 'groth16',
  chainId: 84532,
  txHash: '0x5229aac80f2b710627cc6ef19c793cbb96d83e8eddcbb948b69ab3827baf3c70',
  aggregationId: 7,
  aggregationDetails: {
    root: `0x${'11'.repeat(32)}`,
    leaf: '0xacfacb35509c21dd0f07ea76525f3590b4b414b4d6b05b9ac0966b78fdc99311',
    leafIndex: 3,
    numberOfLeaves: 4,
    merkleProof: [`0x${'22'.repeat(32)}`, `0x${'33'.repeat(32)}`],
  },
});

test('kurier: status ordering treats Aggregated as past Finalized and Failed as never reached', () => {
  assert.equal(hasReached('Finalized', 'Finalized'), true);
  assert.equal(hasReached('Aggregated', 'Finalized'), true);
  assert.equal(hasReached('IncludedInBlock', 'Finalized'), false);
  assert.equal(hasReached('Failed', 'Queued'), false);
  assert.equal(hasReached('SomethingNew', 'Queued'), false);
});

test('kurier: aggregated job maps to the escrow attestation tuple', () => {
  const att = toAttestation(aggregatedJob, 2);
  assert.equal(att.domainId, 2n);
  assert.equal(att.aggregationId, 7n);
  assert.equal(att.index, 3n);
  assert.equal(att.leafCount, 4n);
  assert.equal(att.merklePath.length, 2);
  assert.equal(att.leaf, aggregatedJob.aggregationDetails!.leaf);
});

test('kurier: a job without aggregation cannot become an attestation', () => {
  const finalized = jobStatusSchema.parse({ jobId: 'x', status: 'Finalized' });
  assert.throws(() => toAttestation(finalized, 2), KurierError);
});

test('kurier: client refuses an empty key and never leaks the key in errors', async () => {
  assert.throws(() => new KurierClient('testnet', ''), KurierError);
  const secret = 'k-should-not-leak';
  const failing = (async () => new Response('{"error":"bad"}', { status: 401 })) as typeof fetch;
  const client = new KurierClient('testnet', secret, failing);
  await assert.rejects(client.jobStatus('job'), (e: Error) => !e.message.includes(secret));
});

test('kurier: optimisticVerify other than success is refused', async () => {
  const fake = (async () => new Response(JSON.stringify({ jobId: 'j', optimisticVerify: 'failed' }), { status: 200 })) as typeof fetch;
  const client = new KurierClient('testnet', 'k', fake);
  await assert.rejects(
    client.submitGroth16({ proof: {} as never, publicSignals: [], vkHash: `0x${'00'.repeat(32)}` }),
    /optimistic verification failed/,
  );
});

test('tdx quote: real NEAR AI quote is a production v4 TDX quote under zkVerify size limit', () => {
  const q = parseTdxQuote(fixture.intel_quote);
  assert.equal(q.version, 4);
  assert.equal(q.teeType, 0x81);
  assert.equal(q.debug, false);
  assert.ok(q.sizeBytes <= 8192);
  assert.equal(q.mrTd.length, 96);
});

test('tdx quote: report_data binds the enclave signing address and nonce, and nothing else', () => {
  const { reportData } = parseTdxQuote(fixture.intel_quote);
  assert.equal(reportDataBinds(reportData, fixture.signing_address, fixture.request_nonce), true);
  assert.equal(reportDataBinds(reportData, fixture.signing_address, '00'.repeat(32)), false);
  assert.equal(reportDataBinds(reportData, `0x${'ab'.repeat(20)}`, fixture.request_nonce), false);
});

test('tdx quote: PCK chain chains via Intel SGX PCK Platform CA and yields a 6-byte FMSPC', () => {
  assert.equal(pemChainFromQuote(fixture.intel_quote).length, 3);
  assert.match(pckIssuer(fixture.intel_quote), /Intel SGX PCK Platform CA/);
  assert.match(fmspcFromQuote(fixture.intel_quote), /^[0-9A-F]{12}$/);
});

test('tdx quote: tampered or foreign quotes are rejected', () => {
  const bytes = Buffer.from(fixture.intel_quote, 'hex');
  const v3 = Buffer.from(bytes);
  v3.writeUInt16LE(3, 0);
  assert.throws(() => parseTdxQuote(v3.toString('hex')), /version 3/);
  const sgx = Buffer.from(bytes);
  sgx.writeUInt32LE(0, 4);
  assert.throws(() => parseTdxQuote(sgx.toString('hex')), /not a TDX quote/);
  const debug = Buffer.from(bytes);
  debug[48 + 120] |= 1;
  assert.equal(parseTdxQuote(debug.toString('hex')).debug, true);
  assert.throws(() => parseTdxQuote('zz'), /not hex/);
});
