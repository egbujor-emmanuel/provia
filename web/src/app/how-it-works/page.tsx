import type { Metadata } from 'next';
import { FLOW } from '@/lib/flow';
import { REFUSALS } from '@/lib/refusals';
import { ESCROW, BASESCAN } from '@/lib/evidence';

export const metadata: Metadata = { title: 'How Provia works' };

const CAN = [
  'Read a buyer’s claim and extract the Paystack reference, deterministically.',
  'Prove, with zkTLS, exactly what Paystack’s verify API returned, without revealing the secret key or the buyer’s email.',
  'Prove the release rules with Groth16 and get that proof verified on zkVerify mainnet and testnet.',
  'Release escrowed USDC on Base Sepolia only after the escrow itself checks zkVerify’s aggregation.',
  'Refuse with a typed code and a public receipt whenever any check fails, times out or is uncertain.',
];

const CANNOT = [
  'Release funds on its own judgement: no model or person decides; the escrow contract enforces the proof.',
  'Send funds anywhere but the recipient recorded when the trade was locked.',
  'Release twice for one payment: the nullifier is Poseidon(reference), burned on release.',
  'Accept a leaf from the caller: the contract rebuilds it from its own trade data and the verification key hash.',
  'Move real money: Base Sepolia test USDC and Paystack test mode only.',
];

const DECISIONS = [
  { title: 'zkTLS over webhooks', body: 'A webhook is a message the server receives and must trust. A zkTLS proof shows what Paystack’s TLS server actually sent, signed by Reclaim attestors and checked with Reclaim’s official verifier against their published attestor set.' },
  { title: 'A circuit for the rules', body: 'The amount, currency, deadline, trade binding and status checks live in release_policy.circom. The public output is the nullifier; claimCommit binds the proof to the zkTLS fields so anyone can recompute it.' },
  { title: 'Aggregation checked on-chain', body: 'Kurier submits the proof to zkVerify with Base Sepolia as the aggregation target. ProviaEscrow calls verifyProofAggregation on the zkVerify proxy with a leaf it computes itself.' },
  { title: 'Fail closed', body: 'Every step is wrapped: an error, a timeout or a mismatch ends in a refusal, and the escrow is never asked to release. Writes are simulated before they are sent.' },
];

function Panel({ title, items, tone }: { title: string; items: string[]; tone: 'ok' | 'no' }) {
  return (
    <div className={`rounded-2xl border p-6 ${tone === 'ok' ? 'border-ok/30 bg-ok-soft/50' : 'border-no/30 bg-no-soft/50'}`}>
      <h3 className={`font-display text-3xl ${tone === 'ok' ? 'text-ok' : 'text-no'}`}>{title}</h3>
      <ul className="mt-4 space-y-3 text-ink-2">
        {items.map((t) => (
          <li key={t} className="flex gap-3">
            <span aria-hidden className={tone === 'ok' ? 'text-ok' : 'text-no'}>
              {tone === 'ok' ? '✓' : '✕'}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-14 pt-28 sm:px-6">
      <p className="text-xs uppercase tracking-[0.22em] text-ink-3">How it works</p>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,1.6rem+4vw,4.8rem)] leading-[0.95] tracking-tight">Proof replaces the seller’s eyes.</h1>
      <p className="mt-5 max-w-3xl text-lg text-ink-2">
        Provia sits between a seller of crypto and a buyer paying in fiat. The seller locks funds; the buyer pays through a payment processor (Paystack, in test mode); the agent turns that payment into proofs that zkVerify verifies, and the escrow pays out only against them.
      </p>

      <section aria-labelledby="workflow" className="mt-14">
        <h2 id="workflow" className="font-display text-4xl">The workflow</h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2">
          {FLOW.map((s) => (
            <li key={s.n} className="bg-paper p-5">
              <span className="hash text-ink-3">{s.n}</span>
              <h3 className="mt-1 text-lg font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scope" className="mt-14 grid gap-5 md:grid-cols-2">
        <h2 id="scope" className="sr-only">What the agent can and cannot do</h2>
        <Panel title="It can" items={CAN} tone="ok" />
        <Panel title="It cannot" items={CANNOT} tone="no" />
      </section>

      <section aria-labelledby="choices" className="mt-14">
        <h2 id="choices" className="font-display text-4xl">Key choices</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {DECISIONS.map((d) => (
            <div key={d.title} className="border-t border-ink pt-4">
              <h3 className="text-lg font-medium">{d.title}</h3>
              <p className="mt-2 text-ink-2">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="refusals" className="mt-14">
        <h2 id="refusals" className="font-display text-4xl">Refusal codes</h2>
        <p className="mt-2 text-ink-2">Every refusal is a typed code on a public receipt.</p>
        <dl className="mt-6 divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
          {Object.entries(REFUSALS).map(([code, msg]) => (
            <div key={code} className="grid gap-1 px-5 py-3 sm:grid-cols-[16rem_1fr]">
              <dt className="hash text-no">{code}</dt>
              <dd className="text-sm text-ink-2">{msg}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="contracts" className="mt-14">
        <h2 id="contracts" className="font-display text-4xl">Addresses</h2>
        <dl className="mt-6 space-y-3 text-sm">
          {[
            ['ProviaEscrow', ESCROW.address],
            ['zkVerify proxy', ESCROW.zkVerifyProxy],
            ['Test USDC', ESCROW.token],
          ].map(([label, addr]) => (
            <div key={label} className="flex flex-wrap gap-x-4">
              <dt className="w-36 text-ink-3">{label}</dt>
              <dd>
                <a className="hash underline decoration-rule underline-offset-4 hover:decoration-ink" href={`${BASESCAN}/address/${addr}`} target="_blank" rel="noopener noreferrer">
                  {addr}
                </a>
              </dd>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-4">
            <dt className="w-36 text-ink-3">Policy vkHash</dt>
            <dd className="hash">{ESCROW.vkHash}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
