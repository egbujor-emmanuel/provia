// Kurier REST client: registers the Groth16 VK, submits proofs to zkVerify, and waits for
// finality or aggregation. Every response is schema-checked; nothing upstream is trusted blindly.
// Docs: docs.zkverify.io/overview/getting-started/kurier
import { z } from 'zod';
import type { Groth16Proof } from 'snarkjs';

export type KurierNetwork = 'testnet' | 'mainnet';

export const KURIER_BASE_URL: Record<KurierNetwork, string> = {
  testnet: 'https://api-testnet.kurier.xyz/api/v1',
  mainnet: 'https://api.kurier.xyz/api/v1',
};

/** zkVerify system aggregation domains (architecture/04-proof-aggregation/05-domain-management). */
export const AGGREGATION_DOMAIN = { baseSepolia: 2, base: 2 } as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const JOB_STATUSES = [
  'Queued',
  'Valid',
  'Submitted',
  'IncludedInBlock',
  'Finalized',
  'AggregationPending',
  'Aggregated',
  'AggregationPublished',
  'Failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

const registerVkResponse = z.object({ vkHash: hex32 });
const submitResponse = z.object({ jobId: z.string().min(1), optimisticVerify: z.string() });

const aggregationDetails = z.object({
  receipt: hex32.optional(),
  receiptBlockHash: hex32.optional(),
  root: hex32,
  leaf: hex32,
  leafIndex: z.number().int().nonnegative(),
  numberOfLeaves: z.number().int().positive(),
  merkleProof: z.array(hex32),
});

export const jobStatusSchema = z.object({
  jobId: z.string(),
  status: z.string(),
  statusId: z.number().optional(),
  proofType: z.string().optional(),
  chainId: z.number().nullable().optional(),
  txHash: z.string().nullable().optional(),
  blockHash: z.string().nullable().optional(),
  aggregationId: z.number().int().nonnegative().nullable().optional(),
  statement: z.string().nullable().optional(),
  aggregationDetails: aggregationDetails.nullable().optional(),
  error: z.unknown().optional(),
});
export type JobStatusResponse = z.infer<typeof jobStatusSchema>;

/** The tuple ProviaEscrow.release() forwards to zkVerify's verifyProofAggregation. */
export interface AggregationAttestation {
  readonly domainId: bigint;
  readonly aggregationId: bigint;
  readonly merklePath: readonly string[];
  readonly leafCount: bigint;
  readonly index: bigint;
  readonly leaf: string;
  readonly root: string;
}

export class KurierError extends Error {
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'KurierError';
    this.status = status;
    this.body = body;
  }
}

const STATUS_ORDER: Record<JobStatus, number> = {
  Queued: 0,
  Valid: 1,
  Submitted: 2,
  IncludedInBlock: 3,
  Finalized: 4,
  AggregationPending: 5,
  Aggregated: 6,
  AggregationPublished: 7,
  Failed: -1,
};

/** True once `status` has reached `target` (Failed never reaches anything). */
export function hasReached(status: string, target: Exclude<JobStatus, 'Failed'>): boolean {
  const rank = STATUS_ORDER[status as JobStatus];
  return rank !== undefined && rank >= STATUS_ORDER[target];
}

export function toAttestation(job: JobStatusResponse, domainId: number): AggregationAttestation {
  const d = job.aggregationDetails;
  if (job.aggregationId == null || !d) {
    throw new KurierError(`job ${job.jobId} has no aggregation yet (status ${job.status})`);
  }
  return {
    domainId: BigInt(domainId),
    aggregationId: BigInt(job.aggregationId),
    merklePath: d.merkleProof,
    leafCount: BigInt(d.numberOfLeaves),
    index: BigInt(d.leafIndex),
    leaf: d.leaf,
    root: d.root,
  };
}

export interface WaitOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly onStatus?: (job: JobStatusResponse) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_POLL_FAILURES = 5;

export class KurierClient {
  readonly baseUrl: string;
  readonly network: KurierNetwork;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(network: KurierNetwork, apiKey: string, fetchImpl: typeof fetch = fetch) {
    if (!apiKey) throw new KurierError(`missing Kurier API key for ${network}`);
    this.network = network;
    this.baseUrl = KURIER_BASE_URL[network];
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
  }

  private async request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    // The API key is part of the path; never include the URL in errors or logs.
    const res = await this.#fetch(`${this.baseUrl}${path.replace('{key}', this.#apiKey)}`, {
      signal: AbortSignal.timeout(30_000),
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new KurierError(`Kurier ${this.network} returned non-JSON (HTTP ${res.status})`, res.status, text.slice(0, 200));
    }
    if (!res.ok) throw new KurierError(`Kurier ${this.network} HTTP ${res.status}`, res.status, body);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new KurierError(`Kurier ${this.network} response failed validation: ${parsed.error.message}`, res.status, body);
    return parsed.data;
  }

  async registerVk(vk: object): Promise<string> {
    const { vkHash } = await this.request('/register-vk/{key}', registerVkResponse, {
      method: 'POST',
      body: JSON.stringify({ proofType: 'groth16', proofOptions: { library: 'snarkjs', curve: 'bn128' }, vk }),
    });
    return vkHash;
  }

  /** Submits a Groth16 proof against a registered VK. Pass chainId to request aggregation to that chain. */
  async submitGroth16(args: {
    proof: Groth16Proof;
    publicSignals: readonly string[];
    vkHash: string;
    chainId?: number;
  }): Promise<string> {
    const payload = {
      proofType: 'groth16',
      vkRegistered: true,
      ...(args.chainId !== undefined ? { chainId: args.chainId } : {}),
      proofOptions: { library: 'snarkjs', curve: 'bn128' },
      proofData: { proof: args.proof, publicSignals: args.publicSignals, vk: args.vkHash },
    };
    const res = await this.request('/submit-proof/{key}', submitResponse, { method: 'POST', body: JSON.stringify(payload) });
    if (res.optimisticVerify !== 'success') {
      throw new KurierError(`optimistic verification ${res.optimisticVerify} for job ${res.jobId}`);
    }
    return res.jobId;
  }

  async jobStatus(jobId: string): Promise<JobStatusResponse> {
    return this.request(`/job-status/{key}/${encodeURIComponent(jobId)}`, jobStatusSchema);
  }

  /** Polls until the job reaches `target`; throws on Failed or timeout. */
  /** Consecutive failed status polls tolerated before waitFor gives up. */
  async waitFor(jobId: string, target: Exclude<JobStatus, 'Failed'>, opts: WaitOptions = {}): Promise<JobStatusResponse> {
    const { intervalMs = 5_000, timeoutMs = 15 * 60_000, onStatus, sleep = defaultSleep } = opts;
    const deadline = Date.now() + timeoutMs;
    let last = '';
    let failures = 0;
    for (;;) {
      let job: JobStatusResponse;
      try {
        job = await this.jobStatus(jobId);
        failures = 0;
      } catch (e) {
        // A network blip is not a verdict: retry a few polls before giving up.
        if (++failures >= MAX_POLL_FAILURES || Date.now() > deadline) throw e;
        await sleep(intervalMs);
        continue;
      }
      if (job.status !== last) {
        last = job.status;
        onStatus?.(job);
      }
      if (job.status === 'Failed') throw new KurierError(`job ${jobId} failed`, undefined, job);
      if (hasReached(job.status, target)) return job;
      if (Date.now() > deadline) throw new KurierError(`job ${jobId} stuck at ${job.status} after ${timeoutMs} ms`);
      await sleep(intervalMs);
    }
  }
}
