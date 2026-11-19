// Verifies the agent brain's Intel TDX quote on zkVerify's TEE pallet (settlementTeePallet).
// Volta is used because mainnet's CRL pallet has no Intel CA registered yet (checked 2026-11-19);
// Volta registers Intel_SGX_Processor, which chains the "Intel SGX PCK Platform CA" PCK certs.
import { zkVerifySession, TeeVariant } from 'zkverifyjs';
import type { TeeVerificationKey } from './tee-quote.ts';

export interface TeeVerificationResult {
  readonly network: 'Volta';
  readonly txHash: string;
  readonly blockHash: string;
  readonly statement: string | null;
  readonly status: string;
}

export async function verifyTdxQuoteOnZkVerify(args: {
  readonly seedPhrase: string;
  readonly quoteHex: string;
  readonly vk: Pick<TeeVerificationKey, 'tcbResponse' | 'certificates'>;
}): Promise<TeeVerificationResult> {
  if (!args.seedPhrase) throw new Error('VOLTA_SEED_PHRASE is not set');
  const session = await zkVerifySession.start().Volta().withAccount(args.seedPhrase);
  try {
    const proof = args.quoteHex.startsWith('0x') ? args.quoteHex : `0x${args.quoteHex}`;
    const { transactionResult } = await session
      .verify()
      .tee({ variant: TeeVariant.Intel })
      .execute({ proofData: { proof, publicSignals: [], vk: { tcbResponse: args.vk.tcbResponse, certificates: args.vk.certificates } } });
    const info = (await transactionResult) as unknown as Record<string, unknown>;
    return {
      network: 'Volta',
      txHash: String(info.txHash ?? ''),
      blockHash: String(info.blockHash ?? ''),
      statement: info.statement ? String(info.statement) : null,
      status: String(info.status ?? ''),
    };
  } finally {
    await session.close();
  }
}

export async function voltaFreeBalance(address: string): Promise<bigint> {
  const session = await zkVerifySession.start().Volta().readOnly();
  try {
    const { data } = (await session.api.query.system.account(address)) as unknown as { data: { free: { toString(): string } } };
    return BigInt(data.free.toString());
  } finally {
    await session.close();
  }
}
