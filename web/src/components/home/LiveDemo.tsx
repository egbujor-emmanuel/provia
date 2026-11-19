'use client';

import { useEffect, useState } from 'react';
import { getConfig, startScenario, formatNaira, formatUsdc, type AgentConfig } from '@/lib/agent';
import { ReceiptView } from '@/components/receipt/ReceiptView';

const PRESETS: { id: string; n: string; title: string; how: string; kind: 'attack' | 'honest'; expect: string }[] = [
  { id: 'forged-screenshot', n: '01', title: 'Forged screenshot', how: 'Claims with a made-up reference and a doctored alert.', kind: 'attack', expect: 'NO_PAYMENT_AT_PSP' },
  { id: 'short-payment', n: '02', title: 'Short payment', how: 'Really pays, but ₦1,000 of the ₦1,500 price.', kind: 'attack', expect: 'AMOUNT_SHORT' },
  { id: 'wrong-trade', n: '03', title: 'Someone else’s payment', how: 'Pays in full, for a different trade, and claims this one.', kind: 'attack', expect: 'TRADE_MISMATCH' },
  { id: 'replay', n: '04', title: 'Replay', how: 'Reuses a payment that already released a trade.', kind: 'attack', expect: 'REF_REUSED' },
  { id: 'honest', n: '05', title: 'Honest buyer', how: 'Pays in full and on time, then claims.', kind: 'honest', expect: 'RELEASED' },
];

export function LiveDemo() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(setConfig).catch((e: Error) => setConfigError(e.message));
  }, []);

  // Presets in the hero ask the lab to run a scenario.
  useEffect(() => {
    const onRun = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string') void run(id);
    };
    window.addEventListener('provia:run', onRun);
    return () => window.removeEventListener('provia:run', onRun);
  });

  async function run(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { receiptId: rid } = await startScenario(id);
      setReceiptId(rid);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const terms = config
    ? `Each run locks ${formatUsdc(config.demo.tokenUnits)} for ${formatNaira(config.demo.priceKobo)} in the deployed escrow and pays with Paystack’s test card.`
    : configError
      ? `Agent unavailable: ${configError}`
      : 'Reading terms from the agent…';

  return (
    <div className="grid overflow-hidden rounded-xl border border-rule bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="border-b border-rule lg:border-b-0 lg:border-r">
        <p className="border-b border-rule px-5 py-4 text-sm text-ink-3">{terms}</p>
        <ul>
          {PRESETS.map((p) => {
            const tone = p.kind === 'honest' ? 'text-ok' : 'text-no';
            return (
              <li key={p.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => run(p.id)}
                  disabled={!config || busy !== null}
                  className="group grid w-full grid-cols-[2.5rem_1fr_auto] items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="hash pt-1 text-ink-3">{p.n}</span>
                  <span>
                    <span className="block text-[17px] font-medium leading-tight">{p.title}</span>
                    <span className="mt-1 block text-sm text-ink-3">{p.how}</span>
                    <span className={`mt-2 inline-block rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.12em] ${p.kind === 'honest' ? 'border-ok/50 text-ok' : 'border-no/50 text-no'}`}>{p.expect}</span>
                  </span>
                  <span className="pt-0.5 text-sm text-ink-3 transition-colors group-hover:text-ink">{busy === p.id ? 'Starting…' : 'Run →'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="border-t border-rule px-5 py-4 text-sm text-no">
            {error}
          </p>
        )}
      </div>
      <div className="min-w-0 p-5 sm:p-8">
        {receiptId ? (
          <ReceiptView id={receiptId} compact />
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-no">Awaiting a claim</span>
            <p className="max-w-xs font-display text-2xl leading-tight text-ink-2">Pick one. Start with the forged screenshot.</p>
            <p className="max-w-xs text-xs text-ink-3">Refusals settle in seconds. The honest release waits for zkVerify’s aggregation to reach Base Sepolia, usually a few minutes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
