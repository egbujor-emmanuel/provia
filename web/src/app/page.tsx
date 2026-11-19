import Link from 'next/link';
import { Hero } from '@/components/home/Hero';
import { LiveDemo } from '@/components/home/LiveDemo';
import { ProofPath } from '@/components/home/ProofPath';
import { EVIDENCE, REPO_URL } from '@/lib/evidence';

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? '';

const DEV_LINKS = [
  { label: 'llms.txt', href: '/llms.txt', note: 'Plain-text guide for AI judges' },
  { label: 'OpenAPI', href: '/api/openapi.json', note: 'Every agent endpoint, typed' },
  { label: 'Receipts API', href: AGENT ? `${AGENT}/api/receipts` : '/receipts', note: 'Every claim the agent handled' },
  { label: 'Source', href: REPO_URL, note: 'Circuit, contract, agent, site' },
];

function Head({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">{kicker}</p>
      <h2 id={id} className="mt-3 font-display text-[clamp(2rem,1.4rem+2.2vw,3.2rem)] leading-[1.04] tracking-[-0.01em]">
        {title}
      </h2>
      {children && <div className="mt-3 text-[17px] leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Hero />

      <section id="try" aria-labelledby="try-heading" className="scroll-mt-16">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8 sm:py-24">
          <Head id="try-heading" kicker="Attack lab" title="Try to cheat the escrow.">
            <p>Every run is a real trade: a lock on Base Sepolia, a Paystack test payment, real proofs. Four are attacks and must be refused; one is honest and must be paid.</p>
          </Head>
          <div className="mt-10">
            <LiveDemo />
          </div>
        </div>
      </section>

      <section aria-labelledby="path-heading" className="border-y border-rule bg-paper-2">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8 sm:py-24">
          <Head id="path-heading" kicker="How a release happens" title="Instead of trusting what you see, prove what Paystack said." />
          <div className="mt-12">
            <ProofPath />
          </div>
        </div>
      </section>

      <section aria-labelledby="dev-heading">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Head id="dev-heading" kicker="For agents and judges" title="Everything is readable by a machine.">
            <p>The zkVerify Agent Games endpoint is HMAC-signed and fails closed. Receipts are public JSON, and every link opens a public explorer.</p>
          </Head>
          <ul className="grid gap-px self-start overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2">
            {DEV_LINKS.map((l) => (
              <li key={l.label} className="bg-card">
                <a href={l.href} className="group block p-5 transition-colors hover:bg-paper" target={l.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
                  <span className="flex items-center justify-between font-medium">
                    {l.label}
                    <span className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden>
                      →
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-3">{l.note}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="evidence" aria-labelledby="evidence-heading" className="scroll-mt-16 border-t border-rule">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8">
          <Head id="evidence-heading" kicker="On the record" title="Every claim has a transaction." />
          <ul className="mt-10 divide-y divide-rule border-y border-rule">
            {EVIDENCE.map((e) => (
              <li key={e.hash}>
                <a href={e.href} target="_blank" rel="noopener noreferrer" className="group grid gap-2 py-5 sm:grid-cols-[minmax(0,4fr)_minmax(0,6fr)_auto] sm:items-baseline sm:gap-6">
                  <span className="font-display text-2xl leading-tight group-hover:underline">{e.title}</span>
                  <span className="text-sm text-ink-2">{e.claim}</span>
                  <span className="font-mono text-xs text-ink-3">
                    {e.where} · {e.hash.slice(0, 10)}… ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-12">
            <Link href="#try" className="inline-block rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5">
              Run an attack
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
