import { NextResponse, type NextRequest } from "next/server";
import { consumeEmailToken, setUserPassword, userById } from "@/lib/server/db";
import { notifyPasswordChanged } from "@/lib/server/send-account-email";
import { hashPassword } from "@/lib/server/password";
import {
  passwordStrengthIssue,
  passwordStrengthMessage,
} from "@/lib/server/password-strength";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "I forgot my password" - step two: redeem the token and set a new one.
 *
 * POST ONLY, DELIBERATELY. The emailed link points at a PAGE that renders a
 * form; the token is spent only when that form is submitted. Corporate mail
 * gateways and security scanners routinely fetch every URL in an inbound
 * message to check it - if opening the link were enough to consume the token,
 * a scanner would burn it seconds after delivery and the user would be met
 * with "this link has expired" on a link they never touched. Verification
 * links can afford to auto-confirm on GET (a scanner confirming an address
 * achieves the intended outcome); a reset link cannot.
 *
 * Strength is re-checked here rather than trusted from the form. This route
 * is reachable directly, and it is the last point at which a weak password
 * can be refused before it becomes the account's real credential.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const raw = body as { token?: unknown; password?: unknown } | null;
  if (typeof raw?.token !== "string" || raw.token.length === 0) {
    return NextResponse.json({ error: "missing reset token" }, { status: 400 });
  }
  if (typeof raw.password !== "string") {
    return NextResponse.json({ error: "a new password is required" }, { status: 400 });
  }

  /*
   * The token is consumed BEFORE the password is validated, so a wrong or
   * expired token never reveals anything about password rules, and a valid
   * token cannot be probed repeatedly. The cost is that a user who submits a
   * weak password has to request a fresh link - stated plainly in the error
   * so it does not look like a malfunction.
   */
  const consumed = await consumeEmailToken(raw.token, "reset_password");
  if (!consumed) {
    return NextResponse.json(
      {
        error:
          "This reset link has expired or has already been used. " +
          "Request a new one and try again.",
      },
      { status: 400 },
    );
  }

  const user = await userById(consumed.userId);
  if (!user) {
    return NextResponse.json({ error: "account no longer exists" }, { status: 404 });
  }

  const issue = passwordStrengthIssue(raw.password, {
    email: user.email,
    displayName: user.displayName,
  });
  if (issue) {
    return NextResponse.json(
      {
        error: `${passwordStrengthMessage(issue)} That link has now been used - request a new one to try again.`,
      },
      { status: 400 },
    );
  }

  await setUserPassword(user.id, hashPassword(raw.password));

  /*
   * Completing a reset proves control of the mailbox, so record it.
   *
   * This no longer GATES anything - address confirmation was removed on
   * 2026-08-27 for gating nothing. It is kept as a passive fact worth having:
   * it is the only evidence this project holds that a given address actually
   * receives mail, which is exactly what an admin needs when someone reports
   * "the reset email never arrived" (a mistyped address at signup is the one
   * lockout still possible). Surfaced on the admin user page; never shown to
   * the user, who has nothing to do about it.
   */
  if (!user.emailVerifiedAt) {
    const { markEmailVerified } = await import("@/lib/server/db");
    await markEmailVerified(user.id);
  }

  // Not awaited: the password has already changed, and a mail outage must not
  // turn a successful reset into an error the user would act on.
  void notifyPasswordChanged(user.id);

  return NextResponse.json({ ok: true });
}
