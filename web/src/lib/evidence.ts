// Fixed on-chain facts, copied from evidence/*.json in the repository. Every entry links to a
// public explorer so anyone can check it independently.

export const BASESCAN = 'https://sepolia.basescan.org';
export const SUBSCAN_TESTNET = 'https://zkverify-testnet.subscan.io';
export const SUBSCAN_MAINNET = 'https://zkverify.subscan.io';
export const REPO_URL = 'https://github.com/egbujor-emmanuel/provia';

export const ESCROW = {
  address: '0x2786C763748BED21787916D8EC766F1Cde929a26',
  deployTx: '0xf28dd95f3f377e3591149d470cc21625d6f0329a24ff61e3496638d1e7c78d5d',
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
    claim: 'ProviaEscrow on Base Sepolia, wired to the zkVerify proxy and the release-policy key hash.',
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
  {
    title: 'TEE quote verified on zkVerify',
    claim: "zkVerify's TEE pallet verified a real Intel TDX quote from a NEAR AI enclave (integration evidence).",
    href: `${SUBSCAN_TESTNET}/extrinsic/0x1640c2e53ee50925a1339bf0c9b61a8d176dca4a29ce4730f7e9e4e11d5b24ce`,
    hash: '0x1640c2e53ee50925a1339bf0c9b61a8d176dca4a29ce4730f7e9e4e11d5b24ce',
    where: 'zkVerify Subscan',
  },
];
