import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { dequantize, PATH_POINTS } from "@/lib/drawing/resample";
import { scoreGuess, truthPathNormalized } from "@/lib/scoring/score";
import {
  bumpRateLimit,
  datasetBySlug,
  isUserBlocked,
  maybeAdvanceStreak,
  recordGuess,
  recordLowEffortStrike,
  sweepRateLimit,
} from "@/lib/server/db";
import {
  FLAG_AFTER_STRIKES,
  WARN_AFTER_STRIKES,
  lowEffortNotice,
  lowEffortReason,
} from "@/lib/server/low-effort";
import { hashIp, hashUserAgent } from "@/lib/server/hash";
import {
  RATE_LIMIT_MAX,
  bucketExpiry,
  bucketKey,
  clientAddressFrom,
  verdictFor,
} from "@/lib/server/rate-limit";
import {
  SESSION_COOKIE,
  REFERRER_COOKIE,
  isValidSessionId,
  newSessionId,
  sessionCookieOptions,
} from "@/lib/server/session";
import { assessGuess, deviceTypeFrom } from "@/lib/server/suspect";
import { parseGuessPayload } from "@/lib/server/validate-guess";
import { FREE_INTRO_SLUGS } from "@/lib/datasets/free-intro";

/** postgres.js opens a TCP socket, which the edge runtime cannot do. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unverified datasets are not servable. This exists so Phase 3 can be proved
 * end to end before the CDC numbers are confirmed, and it defaults to off, so
 * production keeps the guarantee.
 */
const allowUnverified = process.env.ALLOW_UNVERIFIED_DATASETS === "true";

function jsonError(status: number, error: string, extra?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers: extra });
}

export async function POST(request: NextRequest) {
  // --- rate limit ---------------------------------------------------------
  // First, before any parsing or database reads, so a flood costs as little as
  // possible.

  const now = Date.now();
  const address = clientAddressFrom(request.headers);
  const client =
    hashIp(address) ??
    // No forwarded address (local dev, or an odd proxy): fall back to the
    // session cookie so there is still a bucket, just a weaker one.
    request.cookies.get(SESSION_COOKIE)?.value ??
    "anonymous";

  let verdict;
  try {
    const hits = await bumpRateLimit(bucketKey(client, now), bucketExpiry(now));
    verdict = verdictFor(hits, now);
  } catch (error) {
    console.error("[api/guess] rate limit check failed", error);
    return jsonError(503, "storage unavailable");
  }

  if (!verdict.allowed) {
    return jsonError(429, "too many guesses, slow down", {
      "Retry-After": String(verdict.retryAfterSeconds),
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
      "X-RateLimit-Remaining": "0",
    });
  }

  // Roughly one request in fifty tidies the table. Cheaper than a cron.
  if (Math.random() < 0.02) {
    sweepRateLimit().catch(() => {
      // Housekeeping. Never worth failing a request over.
    });
  }

  // --- parse --------------------------------------------------------------

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "body must be valid JSON");
  }

  const parsed = parseGuessPayload(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const payload = parsed.value;

  // --- the truth, from our copy and never from the request ----------------

  let dataset;
  try {
    dataset = await datasetBySlug(payload.slug);
  } catch (error) {
    console.error("[api/guess] dataset lookup failed", error);
    return jsonError(503, "storage unavailable");
  }

  if (!dataset) return jsonError(404, "unknown dataset");

  if (!dataset.isActive && !allowUnverified) {
    return jsonError(403, "dataset is not active");
  }

  // --- score, server-side -------------------------------------------------

  const truth = truthPathNormalized(dataset, PATH_POINTS);
  const scored = scoreGuess(dequantize(payload.path), truth);

  // --- session identity ---------------------------------------------------
  //
  // The anonymous session id is ALWAYS present, logged in or not - it is
  // never replaced, only additionally linked to a user id when one exists.
  // See guesses.user_id in supabase/migrations/20260826154657_users_and_accounts.sql.

  const cookieSession = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = isValidSessionId(cookieSession)
    ? (cookieSession as string)
    : newSessionId();

  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;

  /*
   * A blocked account is refused HERE, not only at sign-in.
   *
   * The session strategy is JWT, so a token issued before an admin blocked
   * someone stays valid and NextAuth will keep accepting it without ever
   * asking Postgres. Without this check a blocked player would keep
   * submitting guesses into the research dataset until their token happened
   * to expire - which is precisely the outcome blocking exists to prevent.
   */
  if (userId) {
    try {
      if (await isUserBlocked(userId)) {
        return jsonError(403, "this account cannot submit guesses");
      }
    } catch (error) {
      // Fail CLOSED here, unlike the rate limiter. If we cannot tell whether
      // someone is blocked, accepting their data is the wrong default -
      // moderation decisions must not be undone by a database blip.
      console.error("[api/guess] block check failed", error);
      return jsonError(503, "storage unavailable");
    }
  }

  const userAgent = request.headers.get("user-agent");

  // "The initial two questions without registration should not go into the
  // database" - a deliberate, explicit carve-out (2026-08-26) from this
  // project's original design, where every anonymous guess was stored by
  // default. Scoped narrowly: only an ANONYMOUS guess on one of the two
  // no-account intro datasets skips the write. Sign in, or play any other
  // dataset, and the guess is recorded exactly as it always has been - the
  // anonymous session pipeline itself is unchanged (see SCHEMA.md's "No PII,
  // ever" note). The score is still computed and returned either way; only
  // the write is skipped.
  const skipPersistence = !userId && FREE_INTRO_SLUGS.includes(payload.slug);

  let response: NextResponse;

  if (skipPersistence) {
    response = NextResponse.json({
      guessId: null,
      orderInSession: null,
      datasetGuessNumber: null,
      persisted: false,
      score: scored.score,
      meanAbsError: scored.meanAbsError,
      meanSignedError: scored.meanSignedError,
    });
  } else {
    const assessment = assessGuess({
      path: payload.path,
      drawMs: payload.drawMs,
      // The authoritative duplicate check happens inside the transaction,
      // where it can be serialised. This is only the part knowable up front.
      isDuplicate: false,
      userAgent,
    });

    // --- write --------------------------------------------------------------

    let stored;
    try {
      stored = await recordGuess({
        sessionId,
        userId,
        datasetId: dataset.id,
        path: payload.path,
        pathResolution: PATH_POINTS,
        drawMs: payload.drawMs,
        redrawCount: payload.redrawCount,
        viewportWidth: payload.viewportWidth,
        score: scored.score,
        meanAbsError: scored.meanAbsError,
        meanSignedError: scored.meanSignedError,
        reasons: assessment.reasons,
        session: {
          country: request.headers.get("x-vercel-ip-country"),
          deviceType: deviceTypeFrom(userAgent),
          referrerHost: request.cookies.get(REFERRER_COOKIE)?.value ?? null,
          uaHash: hashUserAgent(userAgent),
        },
      });
    } catch (error) {
      console.error("[api/guess] insert failed", error);
      return jsonError(503, "could not record guess");
    }

    /*
     * AWAITED, not fire-and-forget - fixed 2026-08-28 after a reported bug:
     * three consecutive qualifying days showed a streak of 1.
     *
     * This used to be `maybeAdvanceStreak(userId).catch(...)` with no await,
     * on the reasoning that a streak failure must not fail a guess that had
     * already landed. The reasoning was right; the mechanism was wrong. A
     * serverless instance can be frozen or torn down the moment the response
     * is sent, so an un-awaited promise is not "background work", it is work
     * that usually never happens. The streak advanced only when the write
     * happened to win a race against the shutdown - which is why days were
     * silently skipped and the count never climbed.
     *
     * The same mistake was made once already with the signup email and fixed
     * the same way: await it, and swallow the failure instead of the wait.
     * The cost is one extra round trip on a locked single-row update.
     *
     * Only for signed-in players - the streak lives on the user row.
     */
    if (userId) {
      try {
        await maybeAdvanceStreak(userId);
      } catch (error) {
        console.error("[api/guess] streak advance failed", error);
      }
    }

    /*
     * Low-effort detection.
     *
     * Judges the SHAPE of the line, never its accuracy - being wrong is the
     * entire point of this dataset and penalising it would destroy the
     * signal. See lib/server/low-effort.ts for what actually gets caught and
     * why every threshold is deliberately loose.
     *
     * Only for signed-in players: an anonymous visitor has no durable
     * identity to accumulate strikes against, and inventing one would mean
     * storing something identifying, which the anonymous pipeline exists to
     * avoid.
     */
    let notice: string | null = null;
    const junk = lowEffortReason(payload.path);
    if (junk && userId) {
      try {
        const { strikes } = await recordLowEffortStrike(userId, FLAG_AFTER_STRIKES);
        // Warn only once the behaviour is a pattern. A single odd-looking
        // line is far more likely to be someone exploring the surface than
        // someone attacking the dataset.
        if (strikes >= WARN_AFTER_STRIKES) notice = lowEffortNotice(junk);
      } catch (error) {
        // Never fail a guess that already landed over a moderation counter.
        console.error("[api/guess] low-effort strike failed", error);
      }
    }

    // The score returned here is the server's, and the client displays this
    // one rather than its own. That is the whole point of recomputing it.
    response = NextResponse.json({
      guessId: stored.id,
      orderInSession: stored.orderInSession,
      datasetGuessNumber: stored.datasetGuessNumber,
      persisted: true,
      score: scored.score,
      meanAbsError: scored.meanAbsError,
      meanSignedError: scored.meanSignedError,
      notice,
    });
  }

  response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  response.headers.set("X-RateLimit-Remaining", String(verdict.remaining));

  // The API is outside the middleware matcher, so a client that posts before
  // ever loading a page still gets a stable session.
  if (!isValidSessionId(cookieSession)) {
    response.cookies.set(
      SESSION_COOKIE,
      sessionId,
      sessionCookieOptions(request.url),
    );
  }

  return response;
}
