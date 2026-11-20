'use client';

import { useEffect, useState } from 'react';
import { listReceipts, type ReceiptSummary } from './agent';

const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';

/** Latest Base Sepolia block, read live from the public RPC. null = unavailable (never guessed). */
export function useBlockNumber(intervalMs = 4_000, initial: number | null = null): number | null {
  const [block, setBlock] = useState<number | null>(initial);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch(BASE_SEPOLIA_RPC, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          signal: AbortSignal.timeout(8_000),
        });
        const j = (await res.json()) as { result?: string };
        if (alive && j.result) setBlock(Number.parseInt(j.result, 16));
      } catch {
        if (alive) setBlock(null);
      }
    };
    read();
    const t = setInterval(read, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return block;
}

export type ReceiptsState = { rows: ReceiptSummary[] } | { error: string } | null;

/** The agent's latest receipts, refreshed on an interval. */
export function useReceipts(intervalMs = 10_000, initial: ReceiptsState = null): ReceiptsState {
  const [state, setState] = useState<ReceiptsState>(initial);
  useEffect(() => {
    let alive = true;
    const read = () =>
      listReceipts()
        .then((rows) => alive && setState({ rows }))
        .catch((e: Error) => alive && setState({ error: e.message }));
    read();
    const t = setInterval(read, intervalMs);
    const onRun = () => setTimeout(read, 1_500);
    window.addEventListener('provia:run', onRun);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('provia:run', onRun);
    };
  }, [intervalMs]);
  return state;
}

export function useUtcClock(): string {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const t = setInterval(tick, 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Ask the attack lab to run a scenario, and bring it into view. */
export function runScenario(id: string): void {
  window.dispatchEvent(new CustomEvent('provia:run', { detail: id }));
  document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
