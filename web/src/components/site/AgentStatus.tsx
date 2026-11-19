'use client';

import { useEffect, useState } from 'react';
import { getConfig } from '@/lib/agent';

type State = { kind: 'checking' } | { kind: 'live'; allReady: boolean } | { kind: 'down'; message: string };

/** Live/unavailable banner: real data only, read from the agent's /api/config. */
export function AgentStatus() {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    let alive = true;
    getConfig()
      .then((c) => alive && setState({ kind: 'live', allReady: ['chain', 'kurier', 'paystack', 'zkTls', 'gas'].every((k) => c.ready[k] !== false) }))
      .catch((e: Error) => alive && setState({ kind: 'down', message: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  const tone =
    state.kind === 'live' ? 'bg-ok-soft text-ok' : state.kind === 'down' ? 'bg-no-soft text-no' : 'bg-paper-2 text-ink-3';
  const label =
    state.kind === 'live' ? (state.allReady ? 'Agent live' : 'Agent live · trades paused') : state.kind === 'down' ? 'Agent unavailable' : 'Checking agent…';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone}`}
      title={state.kind === 'down' ? state.message : 'Status read live from the agent'}
      role="status"
    >
      <span className={`size-1.5 rounded-full bg-current ${state.kind === 'live' ? 'animate-pulse' : ''}`} aria-hidden />
      {label}
    </span>
  );
}
