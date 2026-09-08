/**
 * Cloudflare Turnstile verification.
 *
 * Requested 2026-08-27: "make sure the website is secure and can't be
 * accessed by bots ... probably add Captcha during registration".
 *
 * WHY TURNSTILE. The domain is already on Cloudflare, it is free at any
 * volume this project will see, and it is usually invisible - most people
 * never see a puzzle, which matters because every signup obstacle costs
 * answers, and answers are the entire output of this project. It is also
 * privacy-preserving in a way reCAPTCHA is not: no advertising identity, no
 * cross-site profile, nothing to disclose in the privacy policy.
 *
 * NO NEW DEPENDENCY: verification is one POST, same reasoning as the Resend
 * client this project also declined to install.
 *
 * WHAT THIS DOES AND DOES NOT BUY. It raises the cost of BULK automated
 * signup, which is the actual threat to a research dataset - a thousand
 * scripted accounts drawing junk lines would poison every aggregate. It does
 * not stop a determined individual, and it is not the only defence: the
 * honeypot, the per-address and per-client rate limits, password strength,
 * name screening, suspect-flagging and the n>=50 crowd threshold all still
 * apply. This is one layer, deliberately.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Is Turnstile switched on?
 *
 * Both keys must be present. A half-configured deployment - widget rendered
 * but no secret to check it against, or a secret with no widget producing
 * tokens - is worse than off, because it either blocks every signup or
 * accepts every token unverified.
 */
export function turnstileConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim(),
  );
}

export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  /*
   * Not configured = allowed through, deliberately. This is the one place a
   * fail-OPEN is right: local development and preview deploys have no keys,
   * and a missing bot check must not make it impossible to test signing up.
   * The corresponding risk is a production deploy that silently loses its
   * secret, so turnstileConfigured() is asserted in the audit script and the
   * launch checklist names the variable explicitly.
   */
  if (!secret) return { ok: true };

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing-token" };
  }
  // Turnstile tokens are bounded; anything longer is not one.
  if (token.length > 2048) return { ok: false, reason: "malformed-token" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    // Binds the token to the caller, so a token farmed elsewhere is refused.
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[turnstile] verify endpoint returned ${response.status}`);
      return { ok: false, reason: "verify-unavailable" };
    }

    const data = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (data.success) return { ok: true };
    return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
  } catch (error) {
    /*
     * FAIL CLOSED on a network error, unlike the rate limiter which fails
     * open. The asymmetry is intentional: a limiter failing shut would take
     * signup down for everyone, whereas this failing open would hand a bot
     * an unguarded endpoint precisely when Cloudflare is having a bad day -
     * which is exactly when someone is most likely to be probing.
     */
    console.error("[turnstile] verification failed", error);
    return { ok: false, reason: "verify-error" };
  }
}
