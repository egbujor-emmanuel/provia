'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { getReceipt, SCENARIO_LABEL, type Receipt, type ReceiptStep, type StepStatus } from '@/lib/agent';

const POLL_MS = 3_000;

const STATUS_STYLE: Record<StepStatus, { dot: string; label: string }> = {
  running: { dot: 'bg-run animate-pulse', label: 'working' },
  done: { dot: 'bg-ok', label: 'passed' },
  refused: { dot: 'bg-no', label: 'refused' },
  error: { dot: 'bg-no', label: 'error' },
  skipped: { dot: 'bg-ink-3', label: 'skipped' },
};

const LINK_LABEL: Record<string, string> = {
  lock: 'Lock tx on Basescan',
  escrow: 'Escrow on Basescan',
  subscan: 'zkVerify on Subscan',
  basescan: 'Release tx on Basescan',
};

function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function elapsed(step: ReceiptStep): string {
  const end = step.endedAt ? Date.parse(step.endedAt) : Date.now();
  const s = Math.max(0, Math.round((end - Date.parse(step.startedAt)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function StepRow({ step, index }: { step: ReceiptStep; index: number }) {
  const style = STATUS_STYLE[step.status];
  const links = Object.entries(step.links ?? {}).flatMap(([k, v]) => {
    const href = safeHref(v);
    return href ? [{ k, href }] : [];
  });
  return (
    <li className="receipt-step grid grid-cols-[2rem_1fr] gap-x-4 border-t border-rule py-4 first:border-t-0">
      <span className="hash pt-0.5 text-ink-3">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`size-2 rounded-full ${style.dot}`} aria-hidden />
          <span className="font-medium">{step.title}</span>
          <span className="text-xs uppercase tracking-[0.14em] text-ink-3">
            {style.label} · {elapsed(step)}
          </span>
        </div>
        {step.detail && <p className="mt-1 text-sm text-ink-2 [overflow-wrap:anywhere]">{step.detail}</p>}
        {links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {links.map(({ k, href }) => (
              <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-ink">
                {LINK_LABEL[k] ?? k} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function Verdict({ receipt }: { receipt: Receipt }) {
  if (receipt.outcome === 'pending') {
    return <p className="text-run">Working… each step below is a real network call.</p>;
  }
  if (receipt.outcome === 'released') {
    return <p className="font-display text-4xl text-ok">Released.</p>;
  }
  if (receipt.outcome === 'refused' && receipt.refusal) {
    return (
      <div>
        <p className="font-display text-4xl text-no">Refused.</p>
        <p className="mt-2 text-sm">
          <span className="hash rounded bg-no-soft px-1.5 py-0.5 text-no">{receipt.refusal.code}</span>{' '}
          <span className="text-ink-2">{receipt.refusal.message}</span>
        </p>
        <p className="mt-1 text-sm text-ink-3">No funds moved. The escrow was never asked to release.</p>
      </div>
    );
  }
  return <p className="font-display text-4xl text-no">Stopped on an error.</p>;
}

/** Polls a receipt from the live agent until it settles. */
export function ReceiptView({ id, compact = false }: { id: string; compact?: boolean }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const seen = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await getReceipt(id);
        if (!alive) return;
        setReceipt(r);
        setError(null);
        if (r.outcome === 'pending') timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  useGSAP(
    () => {
      const rows = listRef.current?.querySelectorAll('.receipt-step');
      if (!rows || rows.length <= seen.current) return;
      const fresh = Array.from(rows).slice(seen.current);
      seen.current = rows.length;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.from(fresh, { y: 12, opacity: 0, duration: 0.45, stagger: 0.06, ease: 'power3.out' });
    },
    { dependencies: [receipt?.steps.length], scope: listRef },
  );

  if (!receipt) {
    return <p className="text-sm text-ink-3">{error ? `Receipt unavailable: ${error}` : 'Loading receipt…'}</p>;
  }

  return (
    <article aria-live="polite">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            {SCENARIO_LABEL[receipt.scenario] ?? receipt.scenario} · trade <span className="hash">{receipt.tradeId}</span>
          </p>
          <div className="mt-2">
            <Verdict receipt={receipt} />
          </div>
        </div>
        {compact && (
          <Link href={`/receipts/${receipt.id}`} className="text-sm underline underline-offset-4">
            Public receipt →
          </Link>
        )}
      </header>
      <ol ref={listRef} className="mt-1">
        {receipt.steps.map((s, i) => (
          <StepRow key={`${s.key}-${i}`} step={s} index={i} />
        ))}
      </ol>
      {error && <p className="mt-3 text-xs text-no">Lost contact with the agent; retrying. ({error})</p>}
    </article>
  );
}
