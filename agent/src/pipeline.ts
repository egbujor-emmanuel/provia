// Release pipeline: one buyer claim in, one public receipt out. Fails closed at every step:
// any error, timeout or mismatch ends in a typed refusal and the escrow is never called.
import { evaluateRelease, type PaymentClaim, type Trade } from './policy.ts';
import { REFUSALS, type RefusalCode } from './refusals.ts';
import { parseClaimMessage } from './claim-parse.ts';
import { verifyTransaction } from './paystack.ts';
import { provePaystackTransaction, claimFromProofs, type FieldProof } from './zktls.ts';
import { buildCircuitInput, nullifierFor } from './circuit-input.ts';
import { proveRelease } from './prover.ts';
import { KurierClient, AGGREGATION_DOMAIN, BASE_SEPOLIA_CHAIN_ID, toAttestation } from './kurier.ts';
import type { Chain, TxReceipt } from './chain.ts';
import type { Receipt, ReceiptStep, ReceiptStore } from './receipts.ts';

const RELEASE_ATTEMPTS = 8;
const RELEASE_RETRY_MS = 20_000;

export const ZKVERIFY_EXPLORER ={ mainnet: 'https://zkverify.subscan.io/extrinsic/', testnet: 'https://zkverify-testnet.subscan.io/extrinsic/' } as const;

export interface PipelineDeps {
  readonly chain: Chain;
  readonly store: ReceiptStore;
  readonly kurierTestnet: KurierClient;
  readonly kurierMainnet: KurierClient | null;
  readonly vkHash: string;
  readonly reclaimOrgToken: string | undefined;
  readonly paystackKey: string | undefined;
  readonly usedReferences: Set<string>;
  readonly aggregationTimeoutMs?: number;
}

class Refused extends Error {
  readonly code: RefusalCode;
  constructor(code: RefusalCode, detail?: string) {
    super(detail ?? REFUSALS[code]);
    this.code = code;
  }
}

/** Serialises chain writes so the deployer nonce never races. */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function step<T>(
  store: ReceiptStore,
  receipt: Receipt,
  key: string,
  title: string,
  fn: (s: ReceiptStep) => Promise<T>,
): Promise<T> {
  const s: ReceiptStep = { key, title, status: 'running', startedAt: new Date().toISOString() };
  receipt.steps.push(s);
  store.save(receipt);
  try {
    const out = await fn(s);
    s.status = 'done';
    return out;
  } catch (e) {
    s.status = e instanceof Refused ? 'refused' : 'error';
    s.detail = s.detail ?? (e as Error).message;
    throw e;
  } finally {
    s.endedAt = new Date().toISOString();
    store.save(receipt);
  }
}

export async function runClaim(deps: PipelineDeps, receipt: Receipt, message: string): Promise<Receipt> {
  const { chain, store } = deps;
  const tradeId = BigInt(receipt.tradeId);
  try {
    const onchain = await step(store, receipt, 'trade', 'Read the trade from the escrow', async (s) => {
      const t = await chain.getTrade(tradeId);
      s.data = { state: t.state, recipient: t.recipient, priceKobo: t.priceKobo.toString(), tokenAmount: t.tokenAmount.toString(), deadline: t.deadline.toString() };
      s.links = { escrow: `https://sepolia.basescan.org/address/${chain.escrow.address}` };
      if (t.state !== 'Locked') throw new Refused('TRADE_NOT_LOCKED', `trade state is ${t.state}`);
      return t;
    });
    const trade: Trade = { tradeId, recipient: onchain.recipient, priceKobo: onchain.priceKobo, deadline: onchain.deadline, locked: true };

    const reference = await step(store, receipt, 'claim', "Read the buyer's claim", async (s) => {
      const parsed = parseClaimMessage(message);
      s.data = { message: message.slice(0, 280), how: parsed.how, candidates: parsed.candidates };
      if (!parsed.reference) throw new Refused('NO_PAYMENT_AT_PSP', parsed.how === 'ambiguous' ? 'several possible references; name one' : 'no payment reference in the message');
      s.detail = `reference ${parsed.reference}`;
      return parsed.reference;
    });

    const nullifier = await step(store, receipt, 'replay', 'Check the payment was never used before', async (s) => {
      const n = await nullifierFor(reference);
      s.data = { nullifier: n.toString() };
      if (deps.usedReferences.has(reference) || (await chain.isNullifierUsed(n))) throw new Refused('REF_REUSED');
      return n;
    });

    await step(store, receipt, 'psp', 'Ask Paystack whether the payment exists', async (s) => {
      const tx = await verifyTransaction(reference, deps.paystackKey);
      if (!tx) throw new Refused('NO_PAYMENT_AT_PSP', 'Paystack has no transaction with this reference');
      s.detail = `Paystack reports ${tx.status}; the decision uses only the zkTLS-proven copy below`;
    });

    const { claim } = await step(store, receipt, 'zktls', 'Prove the Paystack response with zkTLS', async (s) => {
      let p: FieldProof[];
      const proved: string[] = [];
      try {
        p = await provePaystackTransaction({
          reference,
          tradeId,
          contextAddress: onchain.recipient,
          orgToken: deps.reclaimOrgToken,
          paystackKey: deps.paystackKey,
          onField: (field, ms) => {
            proved.push(`${field} ${Math.round(ms / 1000)}s`);
            s.detail = `proved: ${proved.join(", ")}`;
            store.save(receipt);
          },
        });
      } catch (e) {
        throw new Refused('ZKTLS_INVALID', `zkTLS proof could not be produced: ${(e as Error).message.slice(0, 160)}`);
      }
      let c: PaymentClaim;
      try {
        c = await claimFromProofs(p, { reference, tradeId, contextAddress: onchain.recipient });
      } catch (e) {
        throw new Refused(/different trade/.test((e as Error).message) ? 'TRADE_MISMATCH' : 'ZKTLS_INVALID', (e as Error).message);
      }
      s.data = {
        revealed: { status: c.status, amountKobo: c.amountKobo.toString(), currency: c.currency, paidAt: c.paidAt.toString(), reference: c.reference, tradeId: c.tradeId.toString() },
        attestors: [...new Set(p.map((x) => x.proof.witnesses[0]?.id))],
        reclaimProofs: p,
      };
      return { claim: c };
    });

    await step(store, receipt, 'policy', 'Apply the release policy', async (s) => {
      const now = await chain.latestTimestamp();
      const verdict = evaluateRelease(trade, claim, (r) => deps.usedReferences.has(r), now);
      if (!verdict.ok) throw new Refused(verdict.code);
      s.detail = 'all checks pass: success, NGN, full amount, on time, this trade, unused';
    });

    const { publicSignals, groth16, signals } = await step(store, receipt, 'groth16', 'Prove the policy (Groth16)', async (s) => {
      const input = await buildCircuitInput(trade, claim);
      const out = await proveRelease(input);
      if (out.signals.nullifier !== nullifier) throw new Error('circuit nullifier differs from Poseidon(reference)');
      s.data = { publicSignals: out.publicSignals, claimCommit: out.signals.claimCommit.toString() };
      return { publicSignals: out.publicSignals, groth16: out.proof, signals: out.signals };
    });

    const mainnet = deps.kurierMainnet
      ? step(store, receipt, 'zkverify-mainnet', 'Verify on zkVerify mainnet', async (s) => {
          const jobId = await deps.kurierMainnet!.submitGroth16({ proof: groth16, publicSignals, vkHash: deps.vkHash });
          const job = await deps.kurierMainnet!.waitFor(jobId, 'Finalized', { intervalMs: 5_000, timeoutMs: 10 * 60_000 });
          s.data = { jobId, txHash: job.txHash, blockHash: job.blockHash };
          if (job.txHash) s.links = { subscan: `${ZKVERIFY_EXPLORER.mainnet}${job.txHash}` };
        }).catch(() => undefined)
      : Promise.resolve(undefined);

    const att = await step(store, receipt, 'zkverify-aggregation', 'Verify on zkVerify and aggregate to Base Sepolia', async (s) => {
      const jobId = await deps.kurierTestnet.submitGroth16({ proof: groth16, publicSignals, vkHash: deps.vkHash, chainId: BASE_SEPOLIA_CHAIN_ID });
      s.data = { jobId };
      let job;
      try {
        job = await deps.kurierTestnet.waitFor(jobId, 'Aggregated', {
          intervalMs: 10_000,
          timeoutMs: deps.aggregationTimeoutMs ?? 20 * 60_000,
          onStatus: (j) => {
            s.detail = `zkVerify status: ${j.status}`;
            if (j.txHash) s.links = { subscan: `${ZKVERIFY_EXPLORER.testnet}${j.txHash}` };
            store.save(receipt);
          },
        });
      } catch (e) {
        throw new Refused('PROOF_NOT_FINALIZED', (e as Error).message);
      }
      const a = toAttestation(job, AGGREGATION_DOMAIN.baseSepolia);
      s.data = { jobId, txHash: job.txHash, aggregationId: a.aggregationId.toString(), leaf: a.leaf, leafIndex: a.index.toString(), leafCount: a.leafCount.toString() };
      return a;
    });

    const tx = await step(store, receipt, 'release', 'Release from escrow', async (s) => {
      // The aggregation root can reach Base Sepolia a little after Kurier reports Aggregated.
      let r: TxReceipt | undefined;
      for (let attempt = 1; ; attempt++) {
        try {
          r = await serialised(() => chain.release(tradeId, signals.nullifier, signals.claimCommit, att));
          break;
        } catch (e) {
          const msg = (e as Error).message;
          if (!msg.includes('ProofNotAttested') || attempt >= RELEASE_ATTEMPTS) throw e;
          s.detail = `waiting for the aggregation root on Base Sepolia (attempt ${attempt}/${RELEASE_ATTEMPTS})`;
          store.save(receipt);
          await new Promise((resolve) => setTimeout(resolve, RELEASE_RETRY_MS));
        }
      }
      deps.usedReferences.add(reference);
      s.links = { basescan: r!.url };
      s.data = { txHash: r!.hash, block: r!.block, recipient: onchain.recipient, tokenAmount: onchain.tokenAmount.toString() };
      return r!;
    });

    await mainnet;
    receipt.outcome = 'released';
    receipt.steps.push({ key: 'done', title: 'Released', status: 'done', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), detail: `paid ${onchain.tokenAmount} USDC units to ${onchain.recipient}`, links: { basescan: tx.url } });
  } catch (e) {
    if (e instanceof Refused) {
      receipt.outcome = 'refused';
      receipt.refusal = { code: e.code, message: e.message };
    } else {
      receipt.outcome = 'error';
      receipt.refusal = undefined;
    }
  }
  store.save(receipt);
  return receipt;
}

export { serialised };
