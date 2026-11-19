// Intel TDX quote (v4) helpers: read the fields Provia binds to, and build the zkVerify TEE
// verification key ({tcbResponse, certificates}) from Intel's Provisioning Certification Service.
// Layout: Intel TDX DCAP Quoting Library API, "Quote Format (TDX-ECDSA, QuoteV4)".
import { X509Certificate } from 'node:crypto';

const HEADER_LEN = 48;
const TD_REPORT_BODY_LEN = 584;
/** TEE_TCB_SVN 16 + MRSEAM 48 + MRSIGNERSEAM 48 + SEAMATTRIBUTES 8 = 120. */
const TD_ATTRIBUTES_OFFSET = HEADER_LEN + 120;
/** ... + TDATTRIBUTES 8 + XFAM 8 + MRTD 48 + MRCONFIGID 48 + MROWNER 48 + MROWNERCONFIG 48 + RTMR0..3 192 = 520. */
const REPORT_DATA_OFFSET = HEADER_LEN + 520;
const MRTD_OFFSET = HEADER_LEN + 136;
const TDX_TEE_TYPE = 0x81;
/** zkVerify's TEE pallet limit on quote size (bytes). */
export const MAX_QUOTE_BYTES = 8192;

/** DER encoding of OID 1.2.840.113741.1.13.1.4 (SGX/TDX FMSPC) followed by OCTET STRING(6). */
const FMSPC_OID = Buffer.from('060a2a864886f84d010d0104', 'hex');

export const INTEL_TDX_TCB_URL = 'https://api.trustedservices.intel.com/tdx/certification/v4/tcb';

export interface TdxQuoteFields {
  readonly version: number;
  readonly teeType: number;
  readonly debug: boolean;
  readonly mrTd: string;
  readonly reportData: string; // 64 bytes, hex without 0x
  readonly sizeBytes: number;
}

export function quoteBytes(quoteHex: string): Buffer {
  const clean = quoteHex.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error('quote is not hex');
  return Buffer.from(clean, 'hex');
}

export function parseTdxQuote(quoteHex: string): TdxQuoteFields {
  const q = quoteBytes(quoteHex);
  if (q.length < HEADER_LEN + TD_REPORT_BODY_LEN) throw new Error(`quote too short: ${q.length} bytes`);
  const version = q.readUInt16LE(0);
  const teeType = q.readUInt32LE(4);
  if (version !== 4) throw new Error(`unsupported quote version ${version}`);
  if (teeType !== TDX_TEE_TYPE) throw new Error(`not a TDX quote (tee type 0x${teeType.toString(16)})`);
  return {
    version,
    teeType,
    debug: (q[TD_ATTRIBUTES_OFFSET] & 0x01) === 1,
    mrTd: q.subarray(MRTD_OFFSET, MRTD_OFFSET + 48).toString('hex'),
    reportData: q.subarray(REPORT_DATA_OFFSET, REPORT_DATA_OFFSET + 64).toString('hex'),
    sizeBytes: q.length,
  };
}

/** NEAR AI binds report_data = signing_address (20 bytes) ‖ 12 zero bytes ‖ nonce (32 bytes). */
export function reportDataBinds(reportDataHex: string, signingAddress: string, nonceHex: string): boolean {
  const expected = signingAddress.replace(/^0x/, '').toLowerCase().padEnd(64, '0') + nonceHex.toLowerCase();
  return reportDataHex.toLowerCase() === expected;
}

/** The PEM certificate chain (PCK leaf first) embedded in the quote's certification data. */
export function pemChainFromQuote(quoteHex: string): string[] {
  const text = quoteBytes(quoteHex).toString('latin1');
  return text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
}

export function fmspcFromQuote(quoteHex: string): string {
  const [pck] = pemChainFromQuote(quoteHex);
  if (!pck) throw new Error('quote carries no PCK certificate chain');
  const der = new X509Certificate(pck).raw;
  const at = der.indexOf(FMSPC_OID);
  if (at < 0) throw new Error('PCK certificate has no FMSPC extension');
  const octet = at + FMSPC_OID.length;
  if (der[octet] !== 0x04 || der[octet + 1] !== 0x06) throw new Error('malformed FMSPC extension');
  return der.subarray(octet + 2, octet + 8).toString('hex').toUpperCase();
}

export function pckIssuer(quoteHex: string): string {
  const [pck] = pemChainFromQuote(quoteHex);
  if (!pck) throw new Error('quote carries no PCK certificate chain');
  return new X509Certificate(pck).issuer;
}

export interface TeeVerificationKey {
  readonly tcbResponse: string; // 0x-hex of Intel's TCB info JSON body
  readonly certificates: string; // 0x-hex of the TCB-Info-Issuer-Chain PEM
  readonly fmspc: string;
  readonly issueDate: string;
  readonly nextUpdate: string;
}

const toHex = (s: string) => `0x${Buffer.from(s, 'utf8').toString('hex')}`;

export async function fetchTeeVerificationKey(fmspc: string, fetchImpl: typeof fetch = fetch): Promise<TeeVerificationKey> {
  if (!/^[0-9A-F]{12}$/.test(fmspc)) throw new Error(`invalid FMSPC ${fmspc}`);
  const res = await fetchImpl(`${INTEL_TDX_TCB_URL}?fmspc=${fmspc}&update=standard`);
  if (!res.ok) throw new Error(`Intel PCS returned HTTP ${res.status} for FMSPC ${fmspc}`);
  const body = await res.text();
  const chainHeader = res.headers.get('TCB-Info-Issuer-Chain') ?? res.headers.get('tcb-info-issuer-chain');
  if (!chainHeader) throw new Error('Intel PCS response lacks TCB-Info-Issuer-Chain');
  const chain = decodeURIComponent(chainHeader);
  const info = JSON.parse(body).tcbInfo as { fmspc: string; issueDate: string; nextUpdate: string };
  if (info.fmspc.toUpperCase() !== fmspc) throw new Error(`TCB info is for FMSPC ${info.fmspc}, expected ${fmspc}`);
  return { tcbResponse: toHex(body), certificates: toHex(chain), fmspc, issueDate: info.issueDate, nextUpdate: info.nextUpdate };
}
