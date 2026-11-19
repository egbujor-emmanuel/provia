import { REFUSALS } from '@/lib/refusals';

export const dynamic = 'force-static';

const receiptRef = { $ref: '#/components/schemas/Receipt' };
const error = { description: 'Error', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } };

export function GET(): Response {
  const server = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:8787';
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Provia agent', version: '1.0.0', description: 'Escrow agent that releases crypto only on a proven, zkVerify-verified payment.' },
    servers: [{ url: server }],
    paths: {
      '/health': { get: { summary: 'Liveness', responses: { '200': { description: 'OK' } } } },
      '/api/config': { get: { summary: 'Escrow, zkVerify and demo parameters, refusal codes, readiness', responses: { '200': { description: 'Config' } } } },
      '/api/demo/{scenario}': {
        post: {
          summary: 'Run a live demo trade (rate limited: 6 per hour per visitor)',
          parameters: [{ name: 'scenario', in: 'path', required: true, schema: { type: 'string', enum: ['honest', 'forged-screenshot', 'short-payment', 'wrong-trade', 'replay'] } }],
          responses: { '202': { description: 'Started', content: { 'application/json': { schema: { type: 'object', properties: { receiptId: { type: 'string' }, tradeId: { type: 'string' } } } } } }, '429': error, '503': error },
        },
      },
      '/api/trades/{tradeId}/claim': {
        post: {
          summary: 'Submit a buyer claim for a locked trade',
          parameters: [{ name: 'tradeId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,40}$' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', maxLength: 2000 } } } } } },
          responses: { '202': { description: 'Started' }, '400': error, '429': error },
        },
      },
      '/api/trades/{tradeId}': { get: { summary: 'On-chain trade state', parameters: [{ name: 'tradeId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Trade' } } } },
      '/api/receipts': { get: { summary: 'Recent receipts (newest first)', responses: { '200': { description: 'Receipt summaries' } } } },
      '/api/receipts/{id}': { get: { summary: 'One receipt', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Receipt', content: { 'application/json': { schema: receiptRef } } }, '404': error } } },
      '/agent': { post: { summary: 'zkVerify Agent Games endpoint: HMAC-SHA256 over the raw body in x-agent-games-signature; preflight returns {ok:true, protocolVersion:"v1"}', responses: { '200': { description: 'Signed reply' }, '401': error } } },
    },
    components: {
      schemas: {
        RefusalCode: { type: 'string', enum: Object.keys(REFUSALS) },
        Receipt: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            tradeId: { type: 'string' },
            scenario: { type: 'string' },
            outcome: { type: 'string', enum: ['pending', 'released', 'refused', 'error'] },
            refusal: { type: 'object', properties: { code: { $ref: '#/components/schemas/RefusalCode' }, message: { type: 'string' } } },
            steps: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, detail: { type: 'string' }, links: { type: 'object', additionalProperties: { type: 'string' } } } } },
          },
        },
      },
    },
  };
  return Response.json(spec);
}
