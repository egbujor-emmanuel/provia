// Durable receipts on a free Hugging Face dataset repo. The host's disk is wiped on every restart,
// so each finished receipt is committed once to <user>/provia-receipts and reloaded at startup.
import { createRepo, downloadFile, listFiles, repoExists, uploadFile } from '@huggingface/hub';
import type { Receipt } from './receipts.ts';

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

export class HfReceiptMirror {
  readonly #repo: { type: 'dataset'; name: string };
  readonly #token: string;
  readonly #mirrored = new Set<string>();

  constructor(repoName: string, token: string) {
    this.#repo = { type: 'dataset', name: repoName };
    this.#token = token;
  }

  get repoName(): string {
    return this.#repo.name;
  }

  async ensureRepo(): Promise<void> {
    if (!(await repoExists({ repo: this.#repo, accessToken: this.#token }))) {
      await createRepo({ repo: this.#repo, accessToken: this.#token, private: true });
    }
  }

  async loadAll(): Promise<Receipt[]> {
    await this.ensureRepo();
    const out: Receipt[] = [];
    const entries = [];
    try {
      for await (const entry of listFiles({ repo: this.#repo, path: 'receipts', accessToken: this.#token })) entries.push(entry);
    } catch (e) {
      // A new dataset has no receipts/ folder until the first receipt is written.
      if (/does not exist/i.test((e as Error).message)) return out;
      throw e;
    }
    for (const entry of entries) {
      if (entry.type !== 'file' || !entry.path.endsWith('.json')) continue;
      const blob = await downloadFile({ repo: this.#repo, path: entry.path, accessToken: this.#token });
      if (!blob) continue;
      try {
        const r = JSON.parse(await blob.text()) as Receipt;
        out.push(r);
        this.#mirrored.add(r.id);
      } catch {
        /* skip a corrupt file rather than refusing to start */
      }
    }
    return out;
  }

  /** Commits a finished receipt once; pending receipts are not mirrored. */
  async saveFinal(r: Receipt): Promise<void> {
    if (r.outcome === 'pending' || this.#mirrored.has(r.id)) return;
    this.#mirrored.add(r.id);
    try {
      await uploadFile({
        repo: this.#repo,
        accessToken: this.#token,
        file: { path: `receipts/${r.id}.json`, content: new Blob([json(r)], { type: 'application/json' }) },
        commitTitle: `receipt ${r.id} (${r.scenario}: ${r.outcome})`,
      });
    } catch (e) {
      this.#mirrored.delete(r.id);
      process.stderr.write(`receipt mirror failed for ${r.id}: ${(e as Error).message}\n`);
    }
  }
}
