import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createUser, updateUserProfile, userById } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { parseProfileFields, parseSignupPayload } from "@/lib/server/validate-signup";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { consumeRateBudget } from "@/lib/server/guard";
import { screenFormSubmission } from "@/lib/form-guard";

/** postgres.js opens a TCP socket, which the edge runtime cannot do. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  role: "user" | "admin";
  streak: {
    currentStreak: number;
    longestStreak: number;
    freezesAvailable: number;
  };
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    birthYear: user.birthYear,
    city: user.city,
    state: user.state,
    country: user.country,
    role: user.role,
    currentStreak: user.streak.currentStreak,
    longestStreak: user.streak.longestStreak,
    streakFreezesAvailable: user.streak.freezesAvailable,
  };
}

/**
 * Signup. No email verification flow (no transactional email provider is
 * configured - see lib/auth.ts) - an account is usable the moment it's
 * created. That's a real tradeoff: nothing here confirms the email address
 * is real or owned by the signer. Acceptable for a game collecting drawn
 * paths and self-reported demographics already labelled unverified
 * everywhere; would need revisiting before this account system gates
 * anything more sensitive.
 */
export async function POST(request: NextRequest) {
  /*
   * Rate limit BEFORE parsing or hashing. Signup runs scrypt, which is
   * deliberately expensive - letting an unlimited number of requests reach
   * it turns the password hardening into a self-inflicted CPU exhaustion
   * vector. Checking first means a flood costs one cheap counter increment.
   */
  const budget = await consumeRateBudget("signup", request.headers);
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "Too many signups from this network right now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  /*
   * Honeypot and fill-time heuristics. Deliberately returns the SAME shape a
   * successful signup would not - a generic 400 - rather than announcing
   * "you tripped the bot check", which would tell an author exactly what to
   * remove on the next attempt.
   */
  const bot = screenFormSubmission(body as Record<string, unknown>);
  if (bot.looksAutomated) {
    console.warn("[api/account] automated signup blocked", { reason: bot.reason });
    return NextResponse.json({ error: "could not create account" }, { status: 400 });
  }

  /*
   * Bot check BEFORE any parsing or database work, for the same reason the
   * rate limiter runs first on /api/guess: the cheapest possible rejection
   * for the traffic this exists to reject.
   *
   * Verified server side against Cloudflare, never trusted from the client -
   * the widget only produces a token, and a token is worth nothing until this
   * call says it is. Skipped entirely when no secret is configured, so local
   * and preview environments still work; see lib/server/turnstile.ts.
   */
  const captcha = await verifyTurnstile(
    (body as { turnstileToken?: unknown } | null)?.turnstileToken,
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  if (!captcha.ok) {
    console.warn("[api/account] turnstile rejected signup", { reason: captcha.reason });
    return NextResponse.json(
      { error: "Could not verify you are human. Reload the page and try again." },
      { status: 400 },
    );
  }

  const parsed = parseSignupPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { email, password, displayName, birthYear, city, state } = parsed.value;

  // Auto-detected, never client-submitted - the same pattern
  // sessions.country and guesses' country field already use.
  const country = request.headers.get("x-vercel-ip-country");

  // Soft-flag, never block: a US city/state entered while the request comes
  // from outside the US. Storing the flag lets location-based findings
  // exclude it by default without ever rejecting the signup itself.
  const locationMismatchFlag = city !== null && country !== null && country !== "US";

  let result;
  try {
    result = await createUser({
      id: crypto.randomUUID(),
      email,
      passwordHash: hashPassword(password),
      displayName,
      birthYear,
      city,
      state,
      country,
      locationMismatchFlag,
    });
  } catch (error) {
    console.error("[api/account] signup insert failed", error);
    return NextResponse.json({ error: "could not create account" }, { status: 503 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: "an account with this email already exists" }, { status: 409 });
  }

  return NextResponse.json({ user: publicUser(result.user) }, { status: 201 });
}

/** Edit the signed-in user's own profile. Nobody can edit anyone else's. */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  // Email/password are not editable here - changing either is a bigger, more
  // sensitive operation (verifying the new email; requiring the current
  // password) this project has not built yet.
  const raw = body as Record<string, unknown>;
  const current = await userById(session.user.id);
  if (!current) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  const parsed = parseProfileFields({
    displayName: raw.displayName ?? current.displayName,
    birthYear: "birthYear" in raw ? raw.birthYear : current.birthYear,
    city: "city" in raw ? raw.city : current.city,
    state: "state" in raw ? raw.state : current.state,
  });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const country = request.headers.get("x-vercel-ip-country");
  const locationMismatchFlag =
    parsed.value.city !== null && country !== null && country !== "US";

  const updated = await updateUserProfile(session.user.id, {
    displayName: parsed.value.displayName,
    birthYear: parsed.value.birthYear,
    city: parsed.value.city,
    state: parsed.value.state,
    locationMismatchFlag,
  });

  if (!updated) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  return NextResponse.json({ user: publicUser(updated) });
}

/** The signed-in user's own profile. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const user = await userById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  return NextResponse.json({ user: publicUser(user) });
}
