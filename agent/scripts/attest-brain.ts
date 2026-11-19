// Attests the agent brain: fetches NEAR AI's TDX quote for a fresh nonce, checks it locally,
// then has zkVerify's TEE pallet (Volta) verify it on-chain. Writes evidence/brain-attestation.json.
// Run from repo root: node --env-file=.env agent/scripts/attest-brain.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fetchBrainAttestation, newNonce } from '../src/nearai.ts';
import { fmspcFromQuote, pckIssuer, fetchTeeVerificationKey } from '../src/tee-quote.ts';
import { verifyTdxQuoteOnZkVerify, voltaFreeBalance } from '../src/tee-verify.ts';

const say = (m: string) => process.stdout.write(`${m}\n`);

const balance = await voltaFreeBalance(process.env.VOLTA_ADDRESS ?? '');
if (balance === 0n) {
  say(`agent Volta account ${process.env.VOLTA_ADDRESS} has 0 tVFY; fund it first`);
  process.exit(2);
}

const nonce = newNonce();
const brain = await fetchBrainAttestation({ apiKey: process.env.NEARAI_API_KEY ?? '', nonce });
say(`brain ${brain.model}: signer ${brain.signingAddress}, MRTD ${brain.mrTd.slice(0, 16)}…, ${brain.quoteBytes} B`);

const fmspc = fmspcFromQuote(brain.intelQuote);
const vk = await fetchTeeVerificationKey(fmspc);
say(`Intel TCB for FMSPC ${fmspc}: valid ${vk.issueDate} → ${vk.nextUpdate}; PCK issuer ${pckIssuer(brain.intelQuote).split('\n')[0]}`);

const result = await verifyTdxQuoteOnZkVerify({ seedPhrase: process.env.VOLTA_SEED_PHRASE ?? '', quoteHex: brain.intelQuote, vk });
say(`zkVerify Volta TEE verification: ${result.status} tx ${result.txHash}`);

writeFileSync(
  'evidence/brain-attestation.json',
  JSON.stringify(
    {
      claim: "A NEAR AI private-model enclave is a genuine, non-debug Intel TDX trust domain whose signing key is bound to a fresh nonce; zkVerify's TEE pallet verified its quote on-chain",
      attestedAt: new Date().toISOString(),
      model: brain.model,
      enclaveSigningAddress: brain.signingAddress,
      nonce,
      mrTd: brain.mrTd,
      quoteSha256: createHash('sha256').update(Buffer.from(brain.intelQuote, 'hex')).digest('hex'),
      quoteBytes: brain.quoteBytes,
      gpuEvidencePresent: brain.hasGpuEvidence,
      fmspc,
      tcbValidity: { issueDate: vk.issueDate, nextUpdate: vk.nextUpdate },
      zkVerify: { network: result.network, pallet: 'settlementTeePallet', ...result },
      explorer: `https://zkverify-testnet.subscan.io/extrinsic/${result.txHash}`,
    },
    null,
    2,
  ) + '\n',
);
process.exit(0);
