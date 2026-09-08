import { createEmailToken, userById } from "./db.ts";
import { sendEmail, appUrl } from "./email.ts";
import { tokenLink } from "./email-token.ts";
import { resetPassword, passwordChanged } from "../email/templates.ts";

/**
 * The mail this project sends, in one place.
 *
 * Kept out of the route files so the sequence - mint, build the link from the
 * CONFIGURED origin, send - lives in exactly one spot. The half that would
 * drift if this were duplicated is the link construction, which is the
 * security-sensitive part.
 */

export async function sendResetEmail(userId: string): Promise<boolean> {
  const user = await userById(userId);
  if (!user) return false;

  const raw = await createEmailToken(userId, "reset_password");
  const content = resetPassword(tokenLink(appUrl(), "/reset", raw), user.displayName);
  const result = await sendEmail({ to: user.email, kind: "password-reset", ...content });
  return result.ok;
}

/**
 * Fire-and-forget: the notice that a password changed.
 *
 * Deliberately NOT awaited by its callers and never able to fail the request.
 * The password has already changed by the time this runs; making the response
 * depend on a mail provider would mean a provider outage returns an error to
 * someone whose password was in fact successfully changed - the worst
 * possible thing to tell them, since they would try again and get confused
 * about which password is live.
 */
export async function notifyPasswordChanged(userId: string): Promise<void> {
  try {
    const user = await userById(userId);
    if (!user) return;
    const content = passwordChanged(user.displayName);
    await sendEmail({ to: user.email, kind: "password-changed", ...content });
  } catch (error) {
    console.error("[email] password-changed notice failed", error);
  }
}
