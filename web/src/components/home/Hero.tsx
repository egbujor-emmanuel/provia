'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { runScenario, useBlockNumber, useReceipts } from '@/lib/live';
import { SCENARIO_LABEL } from '@/lib/agent';
import { ESCROW, BASESCAN } from '@/lib/evidence';

const HeroStage = dynamic(() => import('./HeroStage').then((m) => m.HeroStage), { ssr: false });
const TruthLens = dynamic(() => import('@/components/lens/TruthLens').then((m) => m.TruthLens), { ssr: false });

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 sm:border-l sm:border-white/10 sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</p>
      <div className="mt-1 truncate font-mono text-[13px] text-white/85">{children}</div>
    </div>
  );
}

function LiveStrip() {
  const block = useBlockNumber();
  const receipts = useReceipts();
  const latest = receipts && 'rows' in receipts ? receipts.rows[0] : undefined;
  const tone = latest?.outcome === 'released' ? 'text-ok' : latest?.outcome === 'refused' ? 'text-no' : 'text-white/60';
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/10 pt-5 sm:grid-cols-4">
      <Stat label="Base Sepolia block">{block === null ? <span className="text-white/40">unavailable</span> : `#${block.toLocaleString('en-US')}`}</Stat>
      <Stat label="Escrow contract">
        <a href={`${BASESCAN}/address/${ESCROW.address}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">
          {ESCROW.address.slice(0, 8)}…{ESCROW.address.slice(-4)} ↗
        </a>
      </Stat>
      <Stat label="Latest receipt">
        {latest ? (
          <Link href={`/receipts/${latest.id}`} className="hover:text-white">
            {SCENARIO_LABEL[latest.scenario] ?? latest.scenario} · <span className={tone}>{latest.refusal?.code ?? latest.outcome.toUpperCase()}</span>
          </Link>
        ) : (
          <span className="text-white/40">{receipts && 'error' in receipts ? 'unavailable' : 'reading…'}</span>
        )}
      </Stat>
      <Stat label="Verified on">zkVerify · mainnet + testnet</Stat>
    </div>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [webgl, setWebgl] = useState(true);
  const onUnsupported = useCallback(() => setWebgl(false), []);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hero-lens', { opacity: 0, duration: 1.6 }, 0)
        .from('.hero-in', { y: 18, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.2);
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="hero-heading" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#050608] text-white">
      <HeroStage />

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 items-center px-4 pt-28 sm:px-8">
        <div className="relative z-10 max-w-[34rem] lg:max-w-[30rem]">
          <p className="hero-in font-mono text-[11px] uppercase tracking-[0.22em] text-white/50">Escrow agent · verified on zkVerify</p>
          <h1 id="hero-heading" className="hero-in mt-5 font-display text-[clamp(2.3rem,1.6rem+2.4vw,3.6rem)] leading-[1.03] tracking-[-0.015em]">
            Crypto escrow that releases only on a verified payment proof.
          </h1>
          <p className="hero-in mt-5 text-[16px] leading-relaxed text-white/65">
            Sellers usually release crypto after looking at a payment alert, and alerts are easy to fake. Provia locks the crypto in a contract and pays out only when the processor’s own record is proven with zkTLS and the trade rules with a Groth16 proof that zkVerify verifies.
          </p>
          <div className="hero-in mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => runScenario('forged-screenshot')} className="rounded-md bg-white px-5 py-3 text-sm font-medium text-black transition-transform hover:-translate-y-0.5">
              Try a forged payment
            </button>
            <button type="button" onClick={() => runScenario('honest')} className="rounded-md border border-white/20 px-5 py-3 text-sm text-white transition-colors hover:border-white/60">
              Run an honest trade
            </button>
          </div>
          <p className="hero-in mt-4 font-mono text-[11px] text-white/40">No wallet · test networks · every step links to an explorer</p>
        </div>
      </div>

      {/* One WebGL scene: beside the text on desktop, below it on phones. */}
      <div className="hero-lens relative mx-4 mt-8 h-[300px] sm:mx-8 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:mt-0 lg:h-auto lg:w-[60%]">
        {webgl && <TruthLens onUnsupported={onUnsupported} />}
      </div>

      <div className="hero-in relative z-10 mx-auto mt-10 w-full max-w-[1280px] px-4 pb-8 sm:px-8 lg:mt-0">
        <LiveStrip />
      </div>
    </section>
  );
}
