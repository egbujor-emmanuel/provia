// Fixed-window per-key limiter for endpoints that spend test gas and test USDC.
export class RateLimiter {
  readonly #perWindow: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, { count: number; resetAt: number }>();

  constructor(opts: { perWindow: number; windowMs: number }) {
    this.#perWindow = opts.perWindow;
    this.#windowMs = opts.windowMs;
  }

  take(key: string, nowMs: number = Date.now()): boolean {
    const h = this.#hits.get(key);
    if (!h || h.resetAt <= nowMs) {
      this.#hits.set(key, { count: 1, resetAt: nowMs + this.#windowMs });
      return true;
    }
    if (h.count >= this.#perWindow) return false;
    this.#hits.set(key, { count: h.count + 1, resetAt: h.resetAt });
    return true;
  }
}
