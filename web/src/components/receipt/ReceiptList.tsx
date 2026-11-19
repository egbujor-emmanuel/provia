'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listReceipts, SCENARIO_LABEL, type ReceiptSummary } from '@/lib/agent';

const OUTCOME_STYLE: Record<ReceiptSummary['outcome'], string> = {
  released: 'bg-ok-soft text-ok',
  refused: 'bg-no-soft text-no',
  pending: 'bg-run-soft text-run',
  error: 'bg-paper-2 text-ink-3',
};

export function ReceiptList() {
  const [rows, setRows] = useState<ReceiptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReceipts().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-no">Receipts unavailable: {error}</p>;
  if (!rows) return <p className="text-sm text-ink-3">Loading receipts…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink-3">No receipts yet. Run a scenario on the home page.</p>;

  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/receipts/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-2">
            <span className="min-w-0">
              <span className="block font-medium">{SCENARIO_LABEL[r.scenario] ?? r.scenario}</span>
              <span className="hash block truncate text-ink-3">
                trade {r.tradeId} · {new Date(r.createdAt).toLocaleString()}
                {r.refusal ? ` · ${r.refusal.code}` : ''}
              </span>
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
