// Spike G2 (kill gate): does ProviaEscrow.statementLeaf() on Base Sepolia equal the leaf zkVerify
// actually aggregated for a real Groth16 proof submitted through Kurier testnet?
// Uses a labelled spike claim (not a product payment). Writes evidence/g2-leaf-parity.json.
// Run from repo root: node --env-file=.env spikes/g2-leaf-parity/run.ts
import { writeFileSync, readFileSync } from 'node:fs';
import { buildCircuitInput } from '../../agent/src/circuit-input.ts';
import { proveRelease, shutdownProver } from '../../agent/src/prover.ts';
import { KurierClient, AGGREGATION_DOMAIN, BASE_SEPOLIA_CHAIN_ID, toAttestation } from '../../agent/src/kurier.ts';

const deployment = JSON.parse(readFileSync('evidence/deployment-base-sepolia.json', 'utf8'));
const vkHash: string = deployment.constructor.vkHash;
const now = BigInt(Math.floor(Date.now() / 1000));

const trade = {
  tradeId: 900_000_000n + (now % 1_000_000n),
  recipient: process.env.DEPLOYER_ADDRESS!,
  priceKobo: 150_000n,
  deadline: now + 86_400n,
  locked: true,
};
const claim = {
  status: 'success',
  amountKobo: 150_000n,
  currency: 'NGN',
  paidAt: now - 30n,
  reference: `provia-spike-g2-${now}`,
  tradeId: trade.tradeId,
};

const log = (msg: string) => process.stdout.write(`${new Date().toISOString()} ${msg}\n`);

const input = await buildCircuitInput(trade, claim);
const { proof, publicSignals, signals } = await proveRelease(input);
await shutdownProver();
log(`proof generated; nullifier ${signals.nullifier}`);

const kurier = new KurierClient('testnet', process.env.KURIER_API_KEY_TESTNET ?? '');
const jobId = await kurier.submitGroth16({ proof, publicSignals, vkHash, chainId: BASE_SEPOLIA_CHAIN_ID });
log(`submitted job ${jobId}`);
const job = await kurier.waitFor(jobId, 'Aggregated', {
  intervalMs: 10_000,
  timeoutMs: 40 * 60_000,
  onStatus: (j) => log(`status ${j.status}${j.txHash ? ` tx ${j.txHash}` : ''}`),
});
const att = toAttestation(job, AGGREGATION_DOMAIN.baseSepolia);

// eth_call statementLeaf(tradeId, recipient, priceKobo, deadline, nullifier, claimCommit)
const { ethers } = await import('ethers');
const provider = new ethers.providers.JsonRpcProvider('https://sepolia.base.org');
const escrow = new ethers.Contract(
  deployment.address,
  [
    'function statementLeaf(uint256,uint256,uint256,uint256,uint256,uint256) view returns (bytes32)',
  ],
  provider,
);
const proxy = new ethers.Contract(
  deployment.constructor.zkVerify,
  ['function verifyProofAggregation(uint256,uint256,bytes32,bytes32[],uint256,uint256) view returns (bool)'],
  provider,
);
const contractLeaf: string = await escrow.statementLeaf(
  signals.tradeId.toString(),
  signals.recipient.toString(),
  signals.priceKobo.toString(),
  signals.deadline.toString(),
  signals.nullifier.toString(),
  signals.claimCommit.toString(),
);
const match = contractLeaf.toLowerCase() === att.leaf.toLowerCase();
log(`kurier leaf   ${att.leaf}`);
log(`contract leaf ${contractLeaf}`);
log(`LEAF PARITY ${match ? 'PASS' : 'FAIL'}`);

let published: boolean | string = 'not checked';
try {
  published = await proxy.verifyProofAggregation(
    att.domainId.toString(),
    att.aggregationId.toString(),
    contractLeaf,
    att.merklePath,
    att.leafCount.toString(),
    att.index.toString(),
  );
} catch (e) {
  published = `call reverted: ${(e as Error).message.slice(0, 120)}`;
}
log(`verifyProofAggregation on Base Sepolia: ${published}`);

writeFileSync(
  'evidence/g2-leaf-parity.json',
  JSON.stringify(
    {
      spike: 'G2 leaf parity (labelled spike claim, not a product payment)',
      checkedAt: new Date().toISOString(),
      kurierNetwork: 'testnet',
      jobId,
      zkVerifyTx: job.txHash,
      zkVerifyBlock: job.blockHash,
      aggregationId: att.aggregationId.toString(),
      domainId: att.domainId.toString(),
      kurierLeaf: att.leaf,
      contractLeaf,
      leafParity: match,
      verifyProofAggregation: published,
      publicSignals,
    },
    null,
    2,
  ) + '\n',
);
process.exit(match ? 0 : 1);
