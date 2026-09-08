/**
 * Fixed-window rate limiting.
 *
 * Serverless functions share no memory, so an in-process counter would reset
 * on every cold start and be per-instance besides. The counter lives in
 * Postgres, keyed by a salted hash plus a window stamp, so the table holds no
 * address and its rows are disposable.
 *
 * The bucket maths is pure and tested here; the atomic increment lives in
 * lib/server/db.ts.
 */

/** Guesses allowed per window, per client. */
export const RATE_LIMIT_MAX = 30;

/** Window length. Fixed windows, not sliding - simpler and good enough. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * A key that changes every window. Callers pass an already-hashed identifier;
 * this never sees a raw address.
 */
export function bucketKey(
  hashedClient: string,
  now: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): string {
  const window = Math.floor(now / windowMs);
  return `${hashedClient}:${window}`;
}

/** When the current window's row stops being useful. */
export function bucketExpiry(
  now: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): Date {
  const window = Math.floor(now / windowMs);
  return new Date((window + 1) * windowMs);
}

export type RateVerdict = {
  allowed: boolean;
  /** Requests left in this window, floored at zero. */
  remaining: number;
  /** Seconds until the window rolls over. For the Retry-After header. */
  retryAfterSeconds: number;
};

export function verdictFor(
  hits: number,
  now: number,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateVerdict {
  const resetsAt = bucketExpiry(now, windowMs).getTime();
  return {
    allowed: hits <= max,
    remaining: Math.max(0, max - hits),
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now) / 1000)),
  };
}

/**
 * The client identity used for limiting, in order of preference.
 *
 * Vercel sets x-forwarded-for; the leftmost entry is the client. Behind other
 * proxies this can be spoofed, which is why the session cookie is the
 * fallback rather than the primary - a spoofed header still gets limited, just
 * per forged identity.
 */
export function clientAddressFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}
