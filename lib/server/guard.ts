import { bumpRateLimit } from "./db.ts";
import { hashIp } from "./hash.ts";
import {
  RATE_LIMIT_WINDOW_MS,
  bucketExpiry,
  bucketKey,
  clientAddressFrom,
  verdictFor,
} from "./rate-limit.ts";

/**
 * Rate limiting for endpoints other than the guess path.
 *
 * POST /api/guess has had a limiter since Phase 3. Until 2026-08-27 signup
 * and sign-in had none at all, which meant:
 *
 *   - an unlimited number of accounts could be created from one machine, at
 *     whatever rate the database would accept. That is the cheapest way to
 *     flood a research dataset, because each account gets its own clean run
 *     through every chart.
 *   - passwords could be guessed against a known email address as fast as
 *     scrypt would answer. scrypt is deliberately slow, which helps, but
 *     "slow" is not "limited".
 *
 * Different actions get different budgets, keyed separately, so exhausting
 * one does not lock a legitimate user out of the others. The `action` string
 * is part of the bucket key for exactly that reason.
 */
export type GuardAction = "signup" | "signin";

const BUDGETS: Record<GuardAction, number> = {
  /*
   * RAISED from 5/hour to 120/hour on 2026-08-28, after the project's owner
   * was blocked from creating an account on their own site.
   *
   * The old comment claimed 5 was "generous for a household or a shared
   * office behind one NAT". That was simply wrong, and wrong in the way that
   * matters most at launch: A CLIENT IS NOT A PERSON. A university, an
   * office, a coffee shop, or any mobile carrier running CGNAT is ONE address
   * shared by thousands. Five signups an hour across an entire campus means
   * the sixth real person is told "too many accounts created from here" and
   * leaves - and this is the single conversion step the whole project depends
   * on. (The same mistaken assumption was corrected in the email limiter days
   * earlier; it survived here because nothing had exercised it at scale.)
   *
   * What replaced it as the actual bot defence is Cloudflare Turnstile, which
   * is verified before any password hashing happens. This number is now a
   * backstop against a scripted flood that somehow gets past that, sized so
   * no plausible group of real humans on one connection will ever reach it.
   *
   * The original reason for limiting at all still stands and is why this is
   * not simply removed: signup runs scrypt, which is deliberately expensive,
   * so an unbounded endpoint is a CPU-exhaustion vector against ourselves.
   */
  signup: 120,
  /*
   * Ten sign-in attempts a minute. A person who has forgotten which password
   * they used will not hit this; an online guessing attack will immediately.
   *
   * Left tight on purpose, and the asymmetry with signup above is deliberate:
   * this one protects an EXISTING account from being guessed into, where the
   * cost of being slightly too strict is a short wait, not a lost user.
   */
  signin: 10,
};

const WINDOWS: Record<GuardAction, number> = {
  signup: 60 * 60 * 1000,
  signin: RATE_LIMIT_WINDOW_MS,
};

export type GuardVerdict = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Consume one unit of the caller's budget for this action.
 *
 * Fails OPEN on a storage error, deliberately. A limiter that cannot reach
 * Postgres should not take signup down with it - the alternative is that a
 * transient database blip locks every visitor out of creating an account.
 * The tradeoff is that an attacker who can knock out the database also
 * disables the limiter, which matters much less because they have already
 * taken out the thing the limiter protects.
 */
export async function consumeRateBudget(
  action: GuardAction,
  headers: Headers,
  fallbackIdentity?: string | null,
): Promise<GuardVerdict> {
  const now = Date.now();
  const windowMs = WINDOWS[action];

  const address = clientAddressFrom(headers);
  const client =
    hashIp(address) ?? fallbackIdentity ?? "anonymous";

  try {
    const hits = await bumpRateLimit(
      `${action}:${bucketKey(client, now, windowMs)}`,
      bucketExpiry(now, windowMs),
    );
    const verdict = verdictFor(hits, now, BUDGETS[action], windowMs);
    return {
      allowed: verdict.allowed,
      retryAfterSeconds: verdict.retryAfterSeconds,
    };
  } catch (error) {
    console.error(`[guard] rate limit check failed for ${action}`, error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
