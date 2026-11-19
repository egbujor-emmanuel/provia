'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useBlockNumber, useReceipts, useUtcClock } from '@/lib/live';
import { SCENARIO_LABEL } from '@/lib/agent';
import { ESCROW, BASESCAN } from '@/lib/evidence';
import { AgentStatus } from '@/components/site/AgentStatus';

const TruthLens = dynamic(() => import('@/components/lens/TruthLens').then((m) => m.TruthLens), { ssr: false });

const OUTCOME: Record<string, string> = {
  released: 'text-ok border-ok/50',
  refused: 'text-no border-no/50',
  pending: 'text-run border-run/50',
  error: 'text-ink-3 border-rule',
};

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{label}</p>
      <div className="mt-1 truncate font-mono text-[13px]">{children}</div>
    </div>
  );
}

/** Live console: chain height, escrow, the truth lens, and the agent's latest receipts. All real. */
export function EscrowWatch() {
  const block = useBlockNumber();
  const receipts = useReceipts();
  const clock = useUtcClock();
  const [webgl, setWebgl] = useState(true);
  const onUnsupported = useCallback(() => setWebgl(false), []);
  const rows = receipts && 'rows' in receipts ? receipts.rows.slice(0, 5) : [];

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-card shadow-[0_1px_0_var(--rule),0_30px_60px_-36px_rgba(21,20,15,0.45)]">
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-rule px-4 py-2.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">Provia · escrow watch</p>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">{clock} UTC</span>
          <AgentStatus />
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-rule border-b border-dashed border-rule sm:grid-cols-3">
        <Cell label="Base Sepolia block">{block === null ? <span className="text-ink-3">unavailable</span> : `#${block.toLocaleString('en-US')}`}</Cell>
        <Cell label="Escrow">
          <a href={`${BASESCAN}/address/${ESCROW.address}`} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-2 hover:decoration-ink">
            {ESCROW.address.slice(0, 8)}…{ESCROW.address.slice(-4)}
          </a>
        </Cell>
        <Cell label="Policy key">
          <span title={ESCROW.vkHash}>{ESCROW.vkHash.slice(0, 10)}…</span>
        </Cell>
      </div>

      <div className="relative h-[300px] bg-ink sm:h-[340px]">
        {webgl ? (
          <TruthLens onUnsupported={onUnsupported} />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center font-mono text-sm text-paper/80">Forged alert ₦1,500.00 → Paystack: no such transaction → REFUSED</div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">Hover the alert · the lens shows what Paystack says</p>
      </div>

      <div className="border-t border-dashed border-rule">
        <p className="px-4 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">Latest receipts</p>
        <ul className="px-1 pb-1 pt-1">
          {receipts === null && <li className="px-3 py-2 text-sm text-ink-3">Reading from the agent…</li>}
          {receipts && 'error' in receipts && <li className="px-3 py-2 text-sm text-ink-3">Receipts unavailable: {receipts.error}</li>}
          {receipts && 'rows' in receipts && rows.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">No receipts yet. Run a scenario.</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/receipts/${r.id}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-md px-3 py-1.5 text-[13px] transition-colors hover:bg-paper">
                <span className="font-mono text-ink-3">{new Date(r.createdAt).toISOString().slice(11, 19)}</span>
                <span className="truncate">{SCENARIO_LABEL[r.scenario] ?? r.scenario}</span>
                <span className={`rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${OUTCOME[r.outcome]}`}>{r.refusal?.code ?? r.outcome}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-rule bg-paper px-4 py-2 font-mono text-[10px] text-ink-3">src · sepolia.base.org eth_blockNumber · agent /api/receipts · ProviaEscrow on Base Sepolia</p>
    </div>
  );
}
