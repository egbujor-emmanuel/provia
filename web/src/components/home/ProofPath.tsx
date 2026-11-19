'use client';

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const NODES = [
  { id: 'psp', label: 'Paystack', sub: 'verify API', x: 70, y: 210 },
  { id: 'zktls', label: 'zkTLS', sub: 'Reclaim attestors', x: 250, y: 90 },
  { id: 'groth', label: 'Groth16', sub: 'release policy', x: 450, y: 210 },
  { id: 'zkv', label: 'zkVerify', sub: 'verify + aggregate', x: 650, y: 90 },
  { id: 'escrow', label: 'Escrow', sub: 'Base Sepolia', x: 830, y: 210 },
] as const;

const STEPS = [
  { key: 'PROVE', title: 'Prove the payment', body: 'zkTLS records what Paystack’s TLS server sent: status, amount, currency, time and trade id. Reclaim’s attestors sign it; the official verifier checks the signer and the exact request.' },
  { key: 'POLICY', title: 'Prove the rules', body: 'One circuit checks success, NGN, full amount, before the deadline, this trade, and derives a one-time nullifier from the reference. Fail any rule and no proof exists.' },
  { key: 'VERIFY', title: 'Verify on zkVerify', body: 'Kurier submits the proof to zkVerify mainnet for finality and to testnet, where it is aggregated and the root relayed to Base Sepolia.' },
  { key: 'RELEASE', title: 'Release, or nothing', body: 'The escrow rebuilds the leaf from its own trade data, asks zkVerify’s proxy to check the aggregation, burns the nullifier and pays the recorded buyer.' },
];

const path = NODES.map((n, i) => `${i ? 'L' : 'M'}${n.x} ${n.y}`).join(' ');

/** The proof path as a live diagram: a pulse travels node to node as you scroll the steps. */
export function ProofPath() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const line = root.current?.querySelector<SVGPathElement>('.pp-line');
      const len = line?.getTotalLength() ?? 1000;
      gsap.set('.pp-line', { attr: { 'stroke-dasharray': len, 'stroke-dashoffset': still ? 0 : len } });
      gsap.set('.pp-pulse', { attr: { 'stroke-dasharray': `14 ${len}` } });
      if (!still) {
        gsap.to('.pp-line', { attr: { 'stroke-dashoffset': 0 }, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'center 50%', scrub: true } });
        gsap.fromTo('.pp-pulse', { attr: { 'stroke-dashoffset': 0 } }, { attr: { 'stroke-dashoffset': -(len + 14) }, repeat: -1, duration: 2.6, ease: 'none' });
      }
      gsap.utils.toArray<HTMLElement>('.pp-step').forEach((el, i) => {
        ScrollTrigger.create({ trigger: el, start: 'top 60%', end: 'bottom 60%', onToggle: (self) => self.isActive && setActive(i) });
      });
    },
    { scope: root },
  );

  const lit = (i: number) => i <= active + 1;

  return (
    <div ref={root} className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ol className="order-2 lg:order-1">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`pp-step border-t py-6 transition-colors duration-500 ${i === active ? 'border-ok' : 'border-rule'}`}>
            <p className={`font-mono text-[11px] tracking-[0.16em] ${i === active ? 'text-ok' : 'text-ink-3'}`}>{s.key}</p>
            <h3 className="mt-2 font-display text-[28px] leading-tight">{s.title}</h3>
            <p className={`mt-3 max-w-md transition-colors duration-500 ${i === active ? 'text-ink-2' : 'text-ink-3'}`}>{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-28">
          <svg viewBox="0 0 900 300" className="w-full" role="img" aria-label="Paystack to zkTLS to Groth16 to zkVerify to the escrow">
            <path d={path} stroke="var(--rule)" strokeWidth="1.5" fill="none" />
            <path className="pp-line" d={path} stroke="var(--ok)" strokeWidth="1.5" fill="none" />
            <path className="pp-pulse" d={path} stroke="var(--ok)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
            {NODES.map((n, i) => (
              <g key={n.id} className="transition-opacity duration-500" opacity={lit(i) ? 1 : 0.35}>
                <circle cx={n.x} cy={n.y} r="34" fill="var(--paper)" stroke={lit(i) ? 'var(--ok)' : 'var(--rule)'} strokeWidth="1.5" />
                {lit(i) && <circle cx={n.x} cy={n.y} r="44" fill="none" stroke="var(--ok)" strokeOpacity="0.25" strokeDasharray="2 6" />}
                <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="13" fontFamily="var(--font-mono-face)" fill="var(--ink)">
                  {String(i + 1).padStart(2, '0')}
                </text>
                <text x={n.x} y={n.y + (n.y < 150 ? -56 : 66)} textAnchor="middle" fontSize="22" fontFamily="var(--font-serif)" fill="var(--ink)">
                  {n.label}
                </text>
                <text x={n.x} y={n.y + (n.y < 150 ? -38 : 86)} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono-face)" fill="var(--ink-3)">
                  {n.sub.toUpperCase()}
                </text>
              </g>
            ))}
          </svg>
          <p className="mt-6 text-sm text-ink-3">No step trusts a picture, a person or a model. Deterministic code and proofs decide; every failure is a typed refusal.</p>
        </div>
      </div>
    </div>
  );
}
