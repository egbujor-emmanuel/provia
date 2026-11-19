import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAgentGames } from '../src/agent-games.ts';
import { sign, verify } from '../src/hmac.ts';
import { parseClaimMessage } from '../src/claim-parse.ts';
import { RateLimiter } from '../src/rate-limit.ts';
import { tradeIdFromMetadata, unixSeconds } from '../src/paystack.ts';
import { expectedHashes, verifyUrl, contextMessage } from '../src/zktls.ts';

const SECRET = 'test-secret-from-rotate';
const preflight = JSON.stringify({ type: 'agent-games.preflight.v1', agent_id: 'agt_1', issued_at: '2026-11-19T00:00:00Z', nonce: 'abc123' });

test('agent games: signed preflight returns {ok:true, protocolVersion:"v1"} with a valid response signature', () => {
  const out = handleAgentGames(preflight, sign(preflight, SECRET), SECRET);
  assert.equal(out.status, 200);
  assert.deepEqual(JSON.parse(out.body), { ok: true, protocolVersion: 'v1' });
  assert.ok(out.signature);
  assert.equal(verify(out.body, out.signature, SECRET), true);
});

test('agent games: bad, missing or wrong-secret signatures get an unsigned 401', () => {
  for (const sig of [undefined, 'deadbeef', sign(preflight, 'other-secret'), sign(preflight + ' ', SECRET)]) {
    const out = handleAgentGames(preflight, sig, SECRET);
    assert.equal(out.status, 401);
    assert.equal(out.signature, null);
  }
});

test('agent games: no secret configured fails closed with 503', () => {
  const out = handleAgentGames(preflight, sign(preflight, SECRET), undefined);
  assert.equal(out.status, 503);
});

test('agent games: unknown tasks get a signed REJECT, past-deadline tasks say so', () => {
  const task = JSON.stringify({ type: 'agent-games.proof-gatekeeper.v1', task_id: 'gk_1', deadline_at: '2030-01-01T00:00:00Z', input: {} });
  const out = handleAgentGames(task, sign(task, SECRET), SECRET);
  assert.deepEqual(JSON.parse(out.body), { task_id: 'gk_1', decision: 'REJECT', reason_code: 'UNSUPPORTED_TASK' });
  assert.equal(verify(out.body, out.signature, SECRET), true);

  const late = JSON.stringify({ type: 'x', task_id: 'gk_2', deadline_at: '2020-01-01T00:00:00Z' });
  assert.equal(JSON.parse(handleAgentGames(late, sign(late, SECRET), SECRET).body).reason_code, 'DEADLINE_PASSED');
});

test('agent games: malformed JSON with a valid signature is a signed REJECT', () => {
  for (const raw of ['not json', '[1,2]', 'null']) {
    const out = handleAgentGames(raw, sign(raw, SECRET), SECRET);
    assert.equal(out.status, 400);
    assert.equal(JSON.parse(out.body).reason_code, 'MALFORMED_TASK');
    assert.equal(verify(out.body, out.signature, SECRET), true);
  }
});

test('claim parser: labelled references win; a lone candidate is accepted; ambiguity refuses', () => {
  assert.equal(parseClaimMessage("Hi, I've sent the ₦1,500. Ref: vgrzv1uk5extoun").reference, 'vgrzv1uk5extoun');
  assert.equal(parseClaimMessage('Payment sent, reference T2026AB99').reference, 'T2026AB99');
  assert.equal(parseClaimMessage('done!! vgrzv1uk5extoun.').reference, 'vgrzv1uk5extoun');
  const amb = parseClaimMessage('either abc12345def or zzz98765yyy');
  assert.equal(amb.reference, null);
  assert.equal(amb.how, 'ambiguous');
  assert.equal(parseClaimMessage('I have paid, please release').reference, null);
  assert.equal(parseClaimMessage('paid 1500 naira').reference, null, 'pure numbers are not references');
});

test('rate limiter: allows N per window per key, then refuses until the window resets', () => {
  const rl = new RateLimiter({ perWindow: 2, windowMs: 1_000 });
  assert.equal(rl.take('a', 0), true);
  assert.equal(rl.take('a', 10), true);
  assert.equal(rl.take('a', 20), false);
  assert.equal(rl.take('b', 20), true);
  assert.equal(rl.take('a', 1_001), true);
});

test('paystack helpers: tradeId only from a clean positive integer string; ISO time to unix seconds', () => {
  assert.equal(tradeIdFromMetadata({ tradeId: '4242' }), 4242n);
  for (const bad of [null, {}, { tradeId: 4242 }, { tradeId: '0' }, { tradeId: '-1' }, { tradeId: '12a' }]) {
    assert.equal(tradeIdFromMetadata(bad), null);
  }
  assert.equal(unixSeconds('2026-11-19T15:07:35.000Z'), 1795100855n);
  assert.equal(unixSeconds('not a date'), null);
});

test('zkTLS binding: request hash depends on the reference; context names the trade', () => {
  assert.notDeepEqual(expectedHashes('refAAAA1111'), expectedHashes('refBBBB2222'));
  assert.deepEqual(expectedHashes('refAAAA1111'), expectedHashes('refAAAA1111'));
  assert.equal(verifyUrl('a/b'), 'https://api.paystack.co/transaction/verify/a%2Fb');
  assert.equal(contextMessage(7n), 'provia:trade:7');
});
