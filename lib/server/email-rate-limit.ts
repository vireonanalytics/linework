import { bumpRateLimit } from "./db.ts";
import { bucketKey, bucketExpiry, verdictFor } from "./rate-limit.ts";
import { peppered } from "./hash.ts";

/**
 * A much tighter limit for anything that causes an email to be sent.
 *
 * The guess endpoint's 30/minute is sized for a person drawing charts. These
 * endpoints are different in kind: each accepted request puts a message in
 * somebody's inbox, and the somebody is chosen by whoever calls the endpoint.
 * Unlimited, /password/forgot is a mail-bombing tool aimed at any address an
 * attacker knows, and the damage lands on a third party plus this project's
 * sending reputation - which, once burned, silently sends every future
 * password reset to spam for everyone.
 *
 * Five per hour is far above what a confused human needs (they get one email
 * and it works, or they retry once or twice) and far below what makes
 * flooding worthwhile.
 */
/**
 * Per ADDRESS. This is the limit that carries the real protection: no matter
 * how many IPs an attacker has, one mailbox cannot be sent more than this in
 * an hour. Tight on purpose, because the person harmed is a third party who
 * never asked to be involved.
 */
export const EMAIL_RATE_MAX_PER_ADDRESS = 5;

/**
 * Per CLIENT. Deliberately much looser than the per-address limit, and the
 * reason is worth stating because the first version got it badly wrong.
 *
 * This was also 5, which blocked the project's own owner within minutes of
 * testing - six addresses tried, ten requests, ceiling hit. That was the
 * cheap symptom of a much worse one: A CLIENT IS NOT A PERSON. An office, a
 * university, a household, a mobile carrier's CGNAT - all of them are one
 * public address shared by many people. Five resets per hour for an entire
 * building means a real user cannot recover their account because a stranger
 * two desks away already did, which re-creates precisely the lockout that
 * removing the verification requirement was meant to eliminate.
 *
 * So this ceiling is not sized for "how often should one person do this". It
 * is sized to blunt a script walking a list of addresses, while staying far
 * above anything a shared connection of ordinary users would produce. The
 * per-address limit above is what actually stops a targeted flood.
 */
export const EMAIL_RATE_MAX_PER_CLIENT = 20;

export const EMAIL_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Limited per address AND per client, not per client alone.
 *
 * Keying only on the caller would let one attacker with a handful of IPs mail
 * a single victim repeatedly. Keying only on the address would let one
 * attacker walk a list of addresses unimpeded. Both keys are checked, so a
 * flood has to be under both ceilings to get through.
 *
 * The address is hashed with the same peppered helper used for user agents,
 * so no raw email address is written to the rate-limit table - that table is
 * deliberately free of anything identifying.
 */
export async function allowEmailAction(
  action: string,
  email: string,
  client: string,
  now: number = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const keys: { key: string; max: number }[] = [
    {
      key: `${action}:addr:${peppered("email", email.trim().toLowerCase())}`,
      max: EMAIL_RATE_MAX_PER_ADDRESS,
    },
    { key: `${action}:client:${client}`, max: EMAIL_RATE_MAX_PER_CLIENT },
  ];

  let worst = { allowed: true, retryAfterSeconds: 0 };

  for (const { key, max } of keys) {
    const hits = await bumpRateLimit(
      bucketKey(key, now, EMAIL_RATE_WINDOW_MS),
      bucketExpiry(now, EMAIL_RATE_WINDOW_MS),
    );
    const verdict = verdictFor(hits, now, max, EMAIL_RATE_WINDOW_MS);
    if (!verdict.allowed) {
      worst = {
        allowed: false,
        retryAfterSeconds: Math.max(worst.retryAfterSeconds, verdict.retryAfterSeconds),
      };
    }
  }

  return worst;
}
