// Agent Games transport security: HMAC-SHA256 over the RAW body, in both directions
// (agentgames.zkverify.io/build §02). Verify before parsing; compare in constant time.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-agent-games-signature';

export function sign(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

export function verify(rawBody: string, signature: string | undefined | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(sign(rawBody, secret), 'hex');
  const provided = Buffer.from(signature.trim().replace(/^sha256=/i, ''), 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
