// Base Sepolia access to the deployed ProviaEscrow and test USDC (ethers v5).
// Every write is simulated first (callStatic) so a revert surfaces as a typed reason, not a lost fee.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ethers } from 'ethers';
import type { AggregationAttestation } from './kurier.ts';

const deploymentPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'evidence', 'deployment-base-sepolia.json');
export const DEPLOYMENT = JSON.parse(readFileSync(deploymentPath, 'utf8')) as {
  address: string;
  chainId: number;
  constructor: { zkVerify: string; vkHash: string; token: string };
};

export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const BASESCAN = 'https://sepolia.basescan.org';
export const USDC_DECIMALS = 6;

const ESCROW_ABI = [
  'function trades(uint256) view returns (address seller, address recipient, uint256 tokenAmount, uint64 priceKobo, uint64 deadline, uint8 state)',
  'function nullifierUsed(uint256) view returns (bool)',
  'function lock(uint256 tradeId, address recipient, uint256 tokenAmount, uint64 priceKobo, uint64 deadline)',
  'function release(uint256 tradeId, uint256 nullifier, uint256 claimCommit, (uint256 domainId, uint256 aggregationId, bytes32[] merklePath, uint256 leafCount, uint256 index) att)',
  'function refund(uint256 tradeId)',
  'function statementLeaf(uint256,uint256,uint256,uint256,uint256,uint256) view returns (bytes32)',
  'error TradeExists()',
  'error InvalidTrade()',
  'error TradeNotLocked()',
  'error NotSeller()',
  'error DeadlinePassed()',
  'error DeadlineNotReached()',
  'error NullifierReused()',
  'error InputOutOfField()',
  'error ProofNotAttested()',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];

export const TRADE_STATES = ['None', 'Locked', 'Released', 'Refunded'] as const;
export type TradeState = (typeof TRADE_STATES)[number];

export interface OnchainTrade {
  readonly tradeId: bigint;
  readonly seller: string;
  readonly recipient: string;
  readonly tokenAmount: bigint;
  readonly priceKobo: bigint;
  readonly deadline: bigint;
  readonly state: TradeState;
}

export interface TxReceipt {
  readonly hash: string;
  readonly block: number;
  readonly url: string;
}

const escrowInterface = new ethers.utils.Interface(ESCROW_ABI);

/** Maps a revert to the escrow's custom error name, or a short message. */
export function revertReason(error: unknown): string {
  const e = error as { error?: { data?: string }; data?: string; reason?: string; message?: string };
  const data = e?.error?.data ?? e?.data;
  if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
    try {
      return escrowInterface.parseError(data).name;
    } catch {
      /* fall through */
    }
  }
  return e?.reason ?? (e?.message ?? String(error)).slice(0, 160);
}

export class Chain {
  readonly provider: ethers.providers.JsonRpcProvider;
  readonly escrow: ethers.Contract;
  readonly usdc: ethers.Contract;
  readonly #signer: ethers.Wallet | null;

  constructor(privateKey?: string, rpcUrl: string = BASE_SEPOLIA_RPC) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl, DEPLOYMENT.chainId);
    this.#signer = privateKey ? new ethers.Wallet(privateKey, this.provider) : null;
    const runner = this.#signer ?? this.provider;
    this.escrow = new ethers.Contract(DEPLOYMENT.address, ESCROW_ABI, runner);
    this.usdc = new ethers.Contract(DEPLOYMENT.constructor.token, ERC20_ABI, runner);
  }

  get signerAddress(): string | null {
    return this.#signer?.address ?? null;
  }

  async getTrade(tradeId: bigint): Promise<OnchainTrade> {
    const t = await this.escrow.trades(tradeId.toString());
    return {
      tradeId,
      seller: t.seller,
      recipient: t.recipient,
      tokenAmount: BigInt(t.tokenAmount.toString()),
      priceKobo: BigInt(t.priceKobo.toString()),
      deadline: BigInt(t.deadline.toString()),
      state: TRADE_STATES[Number(t.state)] ?? 'None',
    };
  }

  async isNullifierUsed(nullifier: bigint): Promise<boolean> {
    return this.escrow.nullifierUsed(nullifier.toString());
  }

  async usdcBalance(address: string): Promise<bigint> {
    return BigInt((await this.usdc.balanceOf(address)).toString());
  }

  async latestTimestamp(): Promise<bigint> {
    return BigInt((await this.provider.getBlock('latest')).timestamp);
  }

  #requireSigner(): ethers.Wallet {
    if (!this.#signer) throw new Error('no signer configured (DEPLOYER_PRIVATE_KEY)');
    return this.#signer;
  }

  async #send(tx: Promise<ethers.ContractTransaction>): Promise<TxReceipt> {
    const sent = await tx;
    const mined = await sent.wait(1);
    return { hash: mined.transactionHash, block: mined.blockNumber, url: `${BASESCAN}/tx/${mined.transactionHash}` };
  }

  /** Seller side: approve (if needed) and lock test USDC for a trade. */
  async lock(args: { tradeId: bigint; recipient: string; tokenAmount: bigint; priceKobo: bigint; deadline: bigint }): Promise<TxReceipt> {
    const signer = this.#requireSigner();
    const allowance = BigInt((await this.usdc.allowance(signer.address, DEPLOYMENT.address)).toString());
    if (allowance < args.tokenAmount) {
      await this.#send(this.usdc.approve(DEPLOYMENT.address, ethers.constants.MaxUint256));
    }
    const params = [args.tradeId.toString(), args.recipient, args.tokenAmount.toString(), args.priceKobo.toString(), args.deadline.toString()] as const;
    try {
      await this.escrow.callStatic.lock(...params);
    } catch (e) {
      throw new Error(`lock would revert: ${revertReason(e)}`);
    }
    return this.#send(this.escrow.lock(...params));
  }

  /** Seller reclaims an unreleased trade after its deadline. Simulated before sending. */
  async refund(tradeId: bigint): Promise<TxReceipt> {
    this.#requireSigner();
    try {
      await this.escrow.callStatic.refund(tradeId.toString());
    } catch (e) {
      throw new Error(`refund would revert: ${revertReason(e)}`);
    }
    return this.#send(this.escrow.refund(tradeId.toString()));
  }

  /** Anyone may release; funds can only go to the recorded recipient. Simulated before sending. */
  async release(tradeId: bigint, nullifier: bigint, claimCommit: bigint, att: AggregationAttestation): Promise<TxReceipt> {
    this.#requireSigner();
    const attTuple = {
      domainId: att.domainId.toString(),
      aggregationId: att.aggregationId.toString(),
      merklePath: att.merklePath,
      leafCount: att.leafCount.toString(),
      index: att.index.toString(),
    };
    const params = [tradeId.toString(), nullifier.toString(), claimCommit.toString(), attTuple] as const;
    try {
      await this.escrow.callStatic.release(...params);
    } catch (e) {
      throw new Error(`release would revert: ${revertReason(e)}`);
    }
    return this.#send(this.escrow.release(...params));
  }
}
