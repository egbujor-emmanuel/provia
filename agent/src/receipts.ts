// Public receipts: one per claim, appended step by step, persisted as JSON so links survive restarts.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RefusalCode } from './refusals.ts';

export type StepStatus = 'running' | 'done' | 'refused' | 'error' | 'skipped';

export interface ReceiptStep {
  readonly key: string;
  readonly title: string;
  status: StepStatus;
  readonly startedAt: string;
  endedAt?: string;
  detail?: string;
  links?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface Receipt {
  readonly id: string;
  readonly tradeId: string;
  readonly scenario: string;
  readonly createdAt: string;
  updatedAt: string;
  outcome: 'pending' | 'released' | 'refused' | 'error';
  refusal?: { code: RefusalCode; message: string };
  steps: ReceiptStep[];
}

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

export class ReceiptStore {
  readonly #dir: string;
  readonly #cache = new Map<string, Receipt>();

  constructor(dir: string) {
    this.#dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Receipt;
        this.#cache.set(r.id, r);
      } catch {
        /* skip unreadable receipt files rather than refusing to start */
      }
    }
  }

  create(tradeId: bigint, scenario: string): Receipt {
    const now = new Date().toISOString();
    const r: Receipt = { id: randomUUID(), tradeId: tradeId.toString(), scenario, createdAt: now, updatedAt: now, outcome: 'pending', steps: [] };
    this.#cache.set(r.id, r);
    this.save(r);
    return r;
  }

  get(id: string): Receipt | undefined {
    return this.#cache.get(id);
  }

  list(limit = 50): Receipt[] {
    return [...this.#cache.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  save(r: Receipt): void {
    r.updatedAt = new Date().toISOString();
    const file = join(this.#dir, `${r.id}.json`);
    writeFileSync(`${file}.tmp`, json(r));
    renameSync(`${file}.tmp`, file);
  }
}
