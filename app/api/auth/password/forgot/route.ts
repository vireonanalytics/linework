import { NextResponse, type NextRequest } from "next/server";
import { userByEmail } from "@/lib/server/db";
import { sendResetEmail } from "@/lib/server/send-account-email";
import { allowEmailAction } from "@/lib/server/email-rate-limit";
import { clientAddressFrom } from "@/lib/server/rate-limit";
import { hashIp } from "@/lib/server/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "I forgot my password" - step one: mail a reset link.
 *
 * ---------------------------------------------------------------------------
 * THIS ENDPOINT ALWAYS RETURNS THE SAME THING
 * ---------------------------------------------------------------------------
 * Whether the address has an account, has an unverified account, or has never
 * been seen, the response is identical: 200 with the same message. Any
 * difference - a 404, a different string, even a measurably faster reply -
 * turns this into an account-enumeration oracle. Someone could feed it a
 * breach list and learn exactly which addresses have accounts here, which is
 * itself a disclosure and the first step in a targeted credential-stuffing
 * run.
 *
 * That is why the work below happens inside the "if the user exists" branch
 * but nothing about it reaches the response.
 *
 * ---------------------------------------------------------------------------
 * AN UNVERIFIED ADDRESS CAN STILL RESET - REVERSED 2026-08-27
 * ---------------------------------------------------------------------------
 * This route originally refused to mail anyone who had not confirmed their
 * address, carried over from a line in SECURITY.md. The human challenged it:
 * "what if the person does not confirm email and forgets the password?" They
 * were right, and the rule is gone.
 *
 * It created a PERMANENT LOCKOUT with no recourse. An unverified account that
 * forgot its password had no route back in - and because this endpoint must
 * answer identically in every case, the person was told a link was on its way
 * while nothing was sent. They would retry forever.
 *
 * The security argument for it does not hold either. It was meant to avoid
 * mailing an address nobody had proven they own - but SIGNUP ALREADY EMAILS
 * THAT SAME ADDRESS, so the rule blocked the recovery mail while permitting
 * the confirmation mail to the identical unverified inbox.
 *
 * What actually authenticates a reset is possession of the mailbox: the link
 * only ever reaches whoever controls that address. That is true whether or
 * not they clicked a previous link. Someone who signed up with an address
 * they do not own gains nothing, because the mail goes to the real owner -
 * who can use it to take over an account created in their name, which is a
 * feature rather than a risk.
 *
 * Completing a reset therefore also MARKS THE ADDRESS VERIFIED (see the reset
 * route): clicking a link sent to that mailbox proves exactly what
 * verification proves.
 *
 * What still guards this endpoint: the identical-response rule below, and two
 * asymmetric hourly limits - tight per address (the mailbox that would be
 * flooded), much looser per client (which is a NETWORK, not a person; see
 * lib/server/email-rate-limit.ts).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown } | null)?.email;
  if (typeof rawEmail !== "string" || rawEmail.trim().length === 0) {
    return NextResponse.json({ error: "an email address is required" }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();

  const client =
    hashIp(clientAddressFrom(request.headers)) ?? "anonymous";

  const limit = await allowEmailAction("forgot", email, client);
  if (!limit.allowed) {
    /*
     * The one case that does answer differently, and it has to: silently
     * dropping the request would leave someone who genuinely needs a reset
     * clicking a button that appears to work and never produces an email.
     * It leaks only that SOMEBODY has been asking about this address
     * recently, not whether an account exists.
     */
    /*
     * Says HOW LONG, rather than "in a little while". A limit with no stated
     * end looks like a malfunction, so people retry immediately - which on a
     * fixed window pushes the counter up without ever letting it drain, and
     * makes the block feel permanent.
     */
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        /*
         * Deliberately does NOT name which ceiling was hit. Saying "from this
         * connection" was simply wrong whenever the per-address limit fired,
         * and naming the address instead would be wrong the other way. The
         * neutral wording is accurate for both, and the concrete wait is the
         * part the reader actually needs.
         */
        error:
          `Too many reset requests. ` +
          `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const user = await userByEmail(email);
    /*
     * Blocked accounts are the one exclusion that remains. A moderation
     * decision should not be quietly undone by letting someone re-enter
     * through the recovery flow - and unlike the verification rule, this
     * costs a legitimate user nothing, because a blocked account has no
     * access to restore.
     */
    if (user && !user.blockedAt) {
      await sendResetEmail(user.id);
    }
  } catch (error) {
    // Logged, never surfaced. A failure here must not become a signal about
    // whether the address exists.
    console.error("[api/password/forgot] failed", error);
  }

  return NextResponse.json({
    ok: true,
    message:
      "If that address has an account, a reset link is on its way. " +
      "Check your inbox and your spam folder.",
  });
}
