// Client for the live Provia agent. Nothing here is ever faked: if the agent cannot be reached,
// callers get an error and the UI says "unavailable".

export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? '').replace(/\/$/, '');

export type StepStatus = 'running' | 'done' | 'refused' | 'error' | 'skipped';

export interface ReceiptStep {
  key: string;
  title: string;
  status: StepStatus;
  startedAt: string;
  endedAt?: string;
  detail?: string;
  links?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface Receipt {
  id: string;
  tradeId: string;
  scenario: string;
  createdAt: string;
  updatedAt: string;
  outcome: 'pending' | 'released' | 'refused' | 'error';
  refusal?: { code: string; message: string };
  steps: ReceiptStep[];
}

export interface ReceiptSummary {
  id: string;
  tradeId: string;
  scenario: string;
  outcome: Receipt['outcome'];
  refusal?: Receipt['refusal'];
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  escrow: { address: string; chainId: number; explorer: string };
  zkVerify: { vkHash: string; proxy: string; aggregationDomain: number; aggregationChainId: number };
  token: { address: string; symbol: string; decimals: number; network: string };
  demo: { priceKobo: string; tokenUnits: string; buyer: string | null; scenarios: Record<string, string> };
  refusals: Record<string, string>;
  ready: Record<string, boolean>;
}

export class AgentUnavailable extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!AGENT_URL) throw new AgentUnavailable('The agent URL is not configured.');
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(75_000) });
  } catch {
    throw new AgentUnavailable('The agent did not answer. It may be waking up; try again in a minute.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Agent replied HTTP ${res.status}`);
  return body as T;
}

export const getConfig = () => call<AgentConfig>('/api/config');
export const getReceipt = (id: string) => call<Receipt>(`/api/receipts/${encodeURIComponent(id)}`);
export const listReceipts = () => call<ReceiptSummary[]>('/api/receipts');
export const startScenario = (scenario: string) =>
  call<{ receiptId: string; tradeId: string }>(`/api/demo/${encodeURIComponent(scenario)}`, { method: 'POST' });

export function formatNaira(kobo: string | number | bigint): string {
  const k = BigInt(kobo);
  const naira = k / 100n;
  const rest = (k % 100n).toString().padStart(2, '0');
  return `₦${naira.toLocaleString('en-NG')}.${rest}`;
}

export function formatUsdc(units: string | number | bigint): string {
  const u = BigInt(units);
  const whole = u / 1_000_000n;
  const frac = (u % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} USDC`;
}

export const SCENARIO_LABEL: Record<string, string> = {
  honest: 'Honest payment',
  'forged-screenshot': 'Forged screenshot',
  'short-payment': 'Short payment',
  'wrong-trade': 'Payment for another trade',
  replay: 'Replayed payment',
  claim: 'Buyer claim',
};
