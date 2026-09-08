import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { setUserPassword, userById } from "@/lib/server/db";
import { notifyPasswordChanged } from "@/lib/server/send-account-email";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import {
  passwordStrengthIssue,
  passwordStrengthMessage,
} from "@/lib/server/password-strength";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Change your own password while signed in.
 *
 * THE CURRENT PASSWORD IS REQUIRED, even though the session already proves
 * who this is. A live session is not the same evidence as knowing the
 * password: sessions get left open on shared machines, and this project's
 * session strategy is a JWT that stays valid until it expires. Without this
 * check, a borrowed laptop is a permanent account takeover - the attacker
 * simply sets a new password and the owner is locked out. With it, the
 * attacker can act as the user only until the token expires.
 *
 * The failure is deliberately generic ("current password is incorrect") and
 * identical whether the account has no password set at all, so this cannot be
 * used to probe how an account was created.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const raw = body as { currentPassword?: unknown; newPassword?: unknown } | null;
  if (typeof raw?.currentPassword !== "string" || typeof raw.newPassword !== "string") {
    return NextResponse.json(
      { error: "current and new passwords are required" },
      { status: 400 },
    );
  }

  const user = await userById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "account no longer exists" }, { status: 404 });
  }

  if (!user.passwordHash || !verifyPassword(raw.currentPassword, user.passwordHash)) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 403 },
    );
  }

  if (raw.newPassword === raw.currentPassword) {
    return NextResponse.json(
      { error: "The new password must be different from the current one." },
      { status: 400 },
    );
  }

  const issue = passwordStrengthIssue(raw.newPassword, {
    email: user.email,
    displayName: user.displayName,
  });
  if (issue) {
    return NextResponse.json({ error: passwordStrengthMessage(issue) }, { status: 400 });
  }

  // setUserPassword also invalidates any outstanding reset tokens, so a link
  // sitting in an inbox cannot be used to undo this change.
  await setUserPassword(user.id, hashPassword(raw.newPassword));

  void notifyPasswordChanged(user.id);

  return NextResponse.json({ ok: true });
}
