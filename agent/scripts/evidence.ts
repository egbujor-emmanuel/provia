// Evidence ledger.
//   build:  node agent/scripts/evidence.ts build   → writes evidence/claims.json from the live agent
//   verify: node agent/scripts/evidence.ts verify  → re-checks every claim against Base Sepolia
// verify needs no keys: it reads public RPC, the deployed contract and the public receipts API.
import { readFileSync, writeFileSync } from 'node:fs';
import { ethers } from 'ethers';

const AGENT = process.env.AGENT_URL ?? 'https://provia-ch7d.onrender.com';
const RPC = process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org';
const CLAIMS = 'evidence/claims.json';
const deployment = JSON.parse(readFileSync('evidence/deployment-base-sepolia.json', 'utf8'));

/** Live runs that back the public claims (receipt ids on the deployed agent). */
const RUNS = [
  { id: '424e142f-33f3-494d-99d2-f59a0467b60b', scenario: 'honest', expect: 'released' },
  { id: '29ac5c6c-44fc-49c2-8ea9-a17480697036', scenario: 'forged-screenshot', expect: 'NO_PAYMENT_AT_PSP' },
  { id: 'e2734178-a79e-4b8a-a377-35e421e71132', scenario: 'short-payment', expect: 'AMOUNT_SHORT' },
  { id: 'ebfb2e28-ba36-4729-b84e-35f5c3c4b65c', scenario: 'wrong-trade', expect: 'TRADE_MISMATCH' },
  { id: '53fbed2f-213b-4dd6-9969-a2858a05b193', scenario: 'replay', expect: 'REF_REUSED' },
] as const;

const ESCROW_ABI = [
  'function trades(uint256) view returns (address seller, address recipient, uint256 tokenAmount, uint64 priceKobo, uint64 deadline, uint8 state)',
  'function nullifierUsed(uint256) view returns (bool)',
  'function vkHash() view returns (bytes32)',
  'function zkVerify() view returns (address)',
];
const STATES = ['None', 'Locked', 'Released', 'Refunded'];

type Step = { key: string; status: string; links?: Record<string, string>; data?: Record<string, unknown>; detail?: string };
type Receipt = { id: string; tradeId: string; scenario: string; outcome: string; refusal?: { code: string }; steps: Step[] };

const txHash = (url?: string) => url?.match(/0x[0-9a-fA-F]{64}/)?.[0];

async function getReceipt(id: string): Promise<Receipt> {
  const res = await fetch(`${AGENT}/api/receipts/${id}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`receipt ${id}: HTTP ${res.status}`);
  return (await res.json()) as Receipt;
}

async function build() {
  const runs = [];
  for (const run of RUNS) {
    const r = await getReceipt(run.id);
    const step = (k: string) => r.steps.find((s) => s.key === k);
    runs.push({
      claim: run.expect === 'released' ? 'An honest payment was proven and the escrow released' : `Attack "${run.scenario}" was refused with ${run.expect}; no release`,
      scenario: run.scenario,
      receipt: `${AGENT}/api/receipts/${r.id}`,
      tradeId: r.tradeId,
      outcome: r.refusal?.code ?? r.outcome,
      lockTx: txHash(step('setup')?.links?.lock),
      zkVerifyMainnetTx: txHash(step('zkverify-mainnet')?.links?.subscan),
      zkVerifyTestnetTx: txHash(step('zkverify-aggregation')?.links?.subscan),
      aggregationId: step('zkverify-aggregation')?.data?.aggregationId,
      releaseTx: txHash(step('release')?.links?.basescan),
      expect: run.expect,
    });
  }
  const claims = {
    generatedAt: new Date().toISOString(),
    howToVerify: 'npm run evidence:verify (no keys needed)',
    network: { chain: 'Base Sepolia', chainId: 84532, rpc: RPC },
    contract: { escrow: deployment.address, deployTx: deployment.deployTx, zkVerifyProxy: deployment.constructor.zkVerify, vkHash: deployment.constructor.vkHash },
    milestones: [
      { claim: 'Escrow rebuilds the statement leaf exactly as zkVerify aggregates it; verifyProofAggregation returned true', file: 'evidence/g2-leaf-parity.json' },
      { claim: "zkVerify's TEE pallet verified a real Intel TDX quote from a NEAR AI enclave (integration evidence)", file: 'evidence/brain-attestation.json' },
      { claim: 'First end-to-end live release by the deployed agent', file: 'evidence/first-live-release.json' },
    ],
    runs,
  };
  writeFileSync(CLAIMS, JSON.stringify(claims, null, 2) + '\n');
  process.stdout.write(`wrote ${CLAIMS} with ${runs.length} live runs\n`);
}

async function verify() {
  const claims = JSON.parse(readFileSync(CLAIMS, 'utf8'));
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC, 84532);
  const escrow = new ethers.Contract(claims.contract.escrow, ESCROW_ABI, provider);
  let failures = 0;
  const check = (ok: boolean, what: string) => {
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${what}\n`);
    if (!ok) failures++;
  };
  const txOk = async (h?: string) => (h ? (await provider.getTransactionReceipt(h))?.status === 1 : false);

  check((await escrow.vkHash()).toLowerCase() === claims.contract.vkHash.toLowerCase(), `escrow pins vkHash ${claims.contract.vkHash.slice(0, 12)}…`);
  check((await escrow.zkVerify()).toLowerCase() === claims.contract.zkVerifyProxy.toLowerCase(), 'escrow points at the zkVerify proxy on Base Sepolia');
  check(await txOk(claims.contract.deployTx), 'escrow deploy tx succeeded');

  for (const run of claims.runs) {
    const t = await escrow.trades(run.tradeId);
    const state = STATES[Number(t.state)];
    check(await txOk(run.lockTx), `${run.scenario}: lock tx succeeded`);
    const receipt = await getReceipt(run.receipt.split('/').pop());
    if (run.expect === 'released') {
      check(receipt.outcome === 'released', `${run.scenario}: public receipt says released`);
      check(await txOk(run.releaseTx), `${run.scenario}: release tx succeeded (the escrow checked zkVerify's aggregation on-chain)`);
      check(state === 'Released', `${run.scenario}: on-chain trade state is Released`);
    } else {
      check(receipt.refusal?.code === run.expect, `${run.scenario}: public receipt refused with ${run.expect}`);
      check(state !== 'Released', `${run.scenario}: on-chain trade was never released (state ${state})`);
    }
  }
  process.stdout.write(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}

const cmd = process.argv[2];
if (cmd === 'build') await build();
else if (cmd === 'verify') await verify();
else throw new Error('usage: evidence.ts build|verify');
