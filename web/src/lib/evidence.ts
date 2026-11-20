// Fixed on-chain facts, copied from evidence/*.json in the repository. Every entry links to a
// public explorer so anyone can check it independently.

export const BASESCAN = 'https://sepolia.basescan.org';
export const SUBSCAN_TESTNET = 'https://zkverify-testnet.subscan.io';
export const SUBSCAN_MAINNET = 'https://zkverify.subscan.io';
export const REPO_URL = 'https://github.com/egbujor-emmanuel/provia';

export const ESCROW = {
  address: '0x92C4a650CB874cB5d450765CEA619c3Dc49aeC79',
  deployTx: '0x708f0a81e85f0b404c35879a4b85466ffc81ce98d55ec5df65af3ddce06de29f',
  zkVerifyProxy: '0x0807C544D38aE7729f8798388d89Be6502A1e8A8',
  vkHash: '0x23abe0175caa02a03514d25fb4812e6ef5f2cee9a9f03800cafae54735446e14',
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  chain: 'Base Sepolia (84532)',
} as const;

export interface EvidenceItem {
  readonly title: string;
  readonly claim: string;
  readonly href: string;
  readonly hash: string;
  readonly where: string;
}

export const EVIDENCE: readonly EvidenceItem[] = [
  {
    title: 'Escrow deployed',
    claim: 'ProviaEscrow on Base Sepolia: only the agent can release, only to the recorded buyer, only with a zkVerify-attested proof, before the deadline, once per payment.',
    href: `${BASESCAN}/tx/${ESCROW.deployTx}`,
    hash: ESCROW.deployTx,
    where: 'Basescan',
  },
  {
    title: 'Proof verified and aggregated',
    claim: 'A release-policy proof verified by zkVerify and aggregated to Base Sepolia; the leaf the escrow rebuilds matched, and verifyProofAggregation returned true.',
    href: `${SUBSCAN_TESTNET}/extrinsic/0x5229aac80f2b710627cc6ef19c793cbb96d83e8eddcbb948b69ab3827baf3c70`,
    hash: '0x5229aac80f2b710627cc6ef19c793cbb96d83e8eddcbb948b69ab3827baf3c70',
    where: 'zkVerify Subscan',
  },
];
