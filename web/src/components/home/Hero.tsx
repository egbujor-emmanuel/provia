'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { runScenario } from '@/lib/live';
import { EscrowWatch } from './EscrowWatch';
import dynamic from 'next/dynamic';

const HeroPaper = dynamic(() => import('./HeroPaper').then((m) => m.HeroPaper), { ssr: false });

const PRESETS = [
  { id: 'forged-screenshot', label: 'Forged screenshot', stamp: 'REFUSED' },
  { id: 'short-payment', label: 'Pays two-thirds of the price', stamp: 'REFUSED' },
  { id: 'wrong-trade', label: 'Payment for another trade', stamp: 'REFUSED' },
  { id: 'replay', label: 'Reused payment', stamp: 'REFUSED' },
  { id: 'honest', label: 'Honest buyer', stamp: 'RELEASED' },
] as const;

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hero-in', { y: 16, opacity: 0, duration: 0.7, stagger: 0.07 })
        .from('.hero-watch', { y: 24, opacity: 0, duration: 0.9 }, 0.15);
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="hero-heading" className="relative isolate overflow-hidden border-b border-rule pt-24 sm:pt-28">
      <HeroPaper />
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 pb-16 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:pb-20">
        <div className="lg:pt-6">
          <p className="hero-in font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">Escrow agent · fiat → crypto · zkVerify</p>
          <h1 id="hero-heading" className="hero-in mt-4 font-display text-[clamp(2.2rem,1.5rem+2.2vw,3.35rem)] leading-[1.05] tracking-[-0.015em]">
            Crypto escrow that releases only on a verified payment proof.
          </h1>
          <p className="hero-in mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-2">
            In a peer-to-peer trade, the seller usually releases crypto after looking at a payment alert, and alerts are easy to fake. Provia holds the crypto in a contract. It releases when the payment processor’s own record is proven with zkTLS and the trade rules are proven with a Groth16 proof verified on zkVerify.
          </p>

          <div className="hero-in mt-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">Try it live, on real networks</p>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {PRESETS.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => runScenario(p.id)} className="group flex w-full items-center justify-between gap-4 py-2.5 text-left text-[15px] transition-colors hover:text-ink">
                    <span className="flex items-center gap-3">
                      <span className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden>
                        →
                      </span>
                      {p.label}
                    </span>
                    <span className={`rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.12em] ${p.stamp === 'RELEASED' ? 'border-ok/50 text-ok' : 'border-no/50 text-no'}`}>{p.stamp}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-in mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" onClick={() => runScenario('forged-screenshot')} className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper transition-transform hover:-translate-y-0.5">
              Run an attack
            </button>
            <Link href="/how-it-works" className="text-sm underline decoration-rule underline-offset-4 hover:decoration-ink">
              How it works
            </Link>
            <Link href="/receipts" className="text-sm underline decoration-rule underline-offset-4 hover:decoration-ink">
              Public receipts
            </Link>
          </div>
          <p className="hero-in mt-6 font-mono text-[11px] text-ink-3">No wallet · test networks only · every step links to an explorer</p>
        </div>

        <div className="hero-watch min-w-0">
          <EscrowWatch />
        </div>
      </div>
    </section>
  );
}
