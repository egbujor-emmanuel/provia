import { ESCROW, REPO_URL } from '@/lib/evidence';
import { REFUSALS } from '@/lib/refusals';

export const dynamic = 'force-static';

export function GET(): Response {
  const agent = process.env.NEXT_PUBLIC_AGENT_URL ?? '(agent URL not configured)';
  const body = `# Provia

> Escrow agent that releases crypto only when the buyer's fiat payment is proven: zkTLS over the payment processor's verify API (Paystack test mode), a Groth16 release-policy proof verified on zkVerify, and an escrow on Base Sepolia that checks zkVerify's aggregation on-chain.

## Agent API (${agent})
- GET  /health
- GET  /api/config: escrow, zkVerify and demo parameters, refusal codes, readiness
- POST /api/demo/{scenario}: run a live trade; scenario in honest | forged-screenshot | short-payment | wrong-trade | replay (rate limited)
- POST /api/trades/{tradeId}/claim  body {"message": "..."}: submit a buyer claim for a locked trade
- GET  /api/trades/{tradeId}: on-chain trade state
- GET  /api/receipts, GET /api/receipts/{id}: public receipts
- POST /agent: zkVerify Agent Games endpoint (HMAC-SHA256 x-agent-games-signature over the raw body)
- OpenAPI: /api/openapi.json

## Contracts (Base Sepolia, 84532)
- ProviaEscrow: ${ESCROW.address}
- zkVerify proxy: ${ESCROW.zkVerifyProxy}
- Release-policy vkHash: ${ESCROW.vkHash}

## Refusal codes
${Object.entries(REFUSALS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Source
${REPO_URL}
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
