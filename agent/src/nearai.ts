// NEAR AI Cloud client: fetches the model enclave's attestation (Intel TDX quote + NVIDIA payload)
// for a caller-chosen nonce, and checks the quote binds the enclave signing key to that nonce.
// Docs: docs.near.ai/cloud ; the report endpoint needs an API key but is not billed.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parseTdxQuote, reportDataBinds, MAX_QUOTE_BYTES } from './tee-quote.ts';

export const NEARAI_BASE_URL = 'https://cloud-api.near.ai/v1';
/** A private (TEE-hosted) model: its attestation carries a per-model TDX quote and GPU evidence. */
export const DEFAULT_BRAIN_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

const modelAttestation = z.object({
  model_name: z.string(),
  signing_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signing_algo: z.string(),
  request_nonce: z.string().regex(/^[0-9a-fA-F]{64}$/),
  intel_quote: z.string().regex(/^[0-9a-fA-F]+$/),
  nvidia_payload: z.string().optional(),
});
const reportSchema = z.object({ model_attestations: z.array(modelAttestation).min(1) });

export interface BrainAttestation {
  readonly model: string;
  readonly signingAddress: string;
  readonly nonce: string;
  readonly intelQuote: string;
  readonly mrTd: string;
  readonly quoteBytes: number;
  readonly hasGpuEvidence: boolean;
}

export function newNonce(): string {
  return randomBytes(32).toString('hex');
}

export async function fetchBrainAttestation(args: {
  readonly apiKey: string;
  readonly nonce: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<BrainAttestation> {
  const { apiKey, nonce, model = DEFAULT_BRAIN_MODEL, fetchImpl = fetch } = args;
  if (!apiKey) throw new Error('NEARAI_API_KEY is not set');
  if (!/^[0-9a-f]{64}$/.test(nonce)) throw new Error('nonce must be 32 bytes of lowercase hex');
  const url = `${NEARAI_BASE_URL}/attestation/report?model=${encodeURIComponent(model)}&nonce=${nonce}&signing_algo=ecdsa`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`NEAR AI attestation HTTP ${res.status}`);
  const report = reportSchema.parse(await res.json());

  // A model may be served by several enclaves; every one must be fresh, production and bound.
  const att = report.model_attestations.find((a) => a.model_name === model);
  if (!att) throw new Error(`no attestation for model ${model}`);
  if (att.request_nonce.toLowerCase() !== nonce) throw new Error('attestation echoes a different nonce');
  const quote = parseTdxQuote(att.intel_quote);
  if (quote.debug) throw new Error('enclave is a debug TD; refusing to trust it');
  if (quote.sizeBytes > MAX_QUOTE_BYTES) throw new Error(`quote is ${quote.sizeBytes} bytes, above zkVerify's limit`);
  if (!reportDataBinds(quote.reportData, att.signing_address, nonce)) {
    throw new Error('TDX report_data does not bind the signing address and nonce');
  }
  return {
    model,
    signingAddress: att.signing_address.toLowerCase(),
    nonce,
    intelQuote: att.intel_quote,
    mrTd: quote.mrTd,
    quoteBytes: quote.sizeBytes,
    hasGpuEvidence: Boolean(att.nvidia_payload),
  };
}
