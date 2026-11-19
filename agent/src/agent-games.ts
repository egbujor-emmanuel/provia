// Agent Games transport (agentgames.zkverify.io/build §02): verify HMAC over the RAW body before
// parsing, answer the signed preflight, and fail closed (signed REJECT) on anything unrecognised.
import { sign, verify } from './hmac.ts';

export const PROTOCOL_VERSION = 'v1';
export const PREFLIGHT_TYPE = 'agent-games.preflight.v1';
/** The platform enforces a 60 s hard deadline; we refuse anything already past its own deadline. */
export const HARD_DEADLINE_MS = 60_000;

export interface AgentReply {
  readonly status: number;
  readonly body: string;
  readonly signature: string | null;
}

function reply(status: number, payload: unknown, secret: string | null): AgentReply {
  const body = JSON.stringify(payload);
  return { status, body, signature: secret ? sign(body, secret) : null };
}

function deadlinePassed(envelope: Record<string, unknown>, nowMs: number): boolean {
  const raw = envelope.deadline_at ?? envelope.deadlineAt;
  if (typeof raw !== 'string') return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t < nowMs;
}

/**
 * Handles one inbound Agent Games POST. Unsigned or badly signed requests get an unsigned 401
 * (we never sign for a caller we could not authenticate). Every authenticated reply is signed.
 */
export function handleAgentGames(rawBody: string, signatureHeader: string | null | undefined, secret: string | undefined, nowMs: number = Date.now()): AgentReply {
  if (!secret) return reply(503, { error: 'agent secret not configured' }, null);
  if (!verify(rawBody, signatureHeader, secret)) return reply(401, { error: 'invalid signature' }, null);

  let envelope: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    envelope = parsed as Record<string, unknown>;
  } catch {
    return reply(400, { decision: 'REJECT', reason_code: 'MALFORMED_TASK' }, secret);
  }

  if (envelope.type === PREFLIGHT_TYPE) return reply(200, { ok: true, protocolVersion: PROTOCOL_VERSION }, secret);

  const taskId = typeof envelope.task_id === 'string' ? envelope.task_id : undefined;
  const reasonCode = deadlinePassed(envelope, nowMs) ? 'DEADLINE_PASSED' : 'UNSUPPORTED_TASK';
  return reply(200, { ...(taskId ? { task_id: taskId } : {}), decision: 'REJECT', reason_code: reasonCode }, secret);
}
