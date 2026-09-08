/**
 * Sending transactional mail, via Resend's REST API.
 *
 * NO SDK, AND THAT IS THE POINT. Resend publishes an npm client, but sending
 * an email here is one POST with a bearer token and a JSON body. Adding a
 * dependency for that would buy nothing and would break the pattern this
 * project has held since Phase 3, where `postgres` was chosen over the
 * Supabase SDK for the same reason: fewer moving parts between this code and
 * the thing it is actually talking to.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Reduce an address to something that cannot identify a person.
 *
 * The admin panel used to list outbound mail with full recipient addresses.
 * The human removed it as "invasive in users' privacy" - correctly, and the
 * objection applies to the STORED ROW just as much as to the page that
 * displayed it. Deleting only the page would have left a quiet who-used-this
 * -site-and-when log in the database.
 *
 * What is kept is what actually answers the question the log exists for -
 * "did sending break, and what did the provider say" - which needs the
 * provider's error and the shape of the address, never the address itself.
 * "r***@gmail.com" is enough to tell a typo'd domain from a working one.
 */
function maskRecipient(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

export type EmailMessage = {
  to: string;
  /** Short label for the admin log: what kind of mail this was. */
  kind?: string;
  subject: string;
  text: string;
  html: string;
};

export type SendResult =
  | { ok: true; id: string | null; delivered: boolean }
  | { ok: false; error: string };

/**
 * Where links in emails point.
 *
 * Read from configuration and never from the incoming request's Host header.
 * A reset link built from a header an attacker controls is the textbook
 * host-header poisoning attack: they trigger a reset for your address, the
 * mail arrives with a link to their domain, and clicking it hands them the
 * token. Falling back to the known production URL keeps that property even
 * if the variable is unset.
 */
export function appUrl(): string {
  return (
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_ENV === "production"
      ? // The public address. Note the deliberate split this project has kept
        // since the rename: infrastructure identifiers stay `draw-the-line`
        // (the repo, the Vercel project, the Supabase project), while
        // anything a PERSON reads says Linework - and a link in an email is
        // read by a person.
        "https://linework.cc"
      : "http://localhost:3000")
  );
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Linework <onboarding@resend.dev>";
}

/**
 * Send one message.
 *
 * WITHOUT AN API KEY THIS LOGS INSTEAD OF THROWING, and that is deliberate.
 * The pattern elsewhere in this project is a hard throw on missing config -
 * lib/server/hash.ts refuses to start without its pepper, because a silent
 * fallback there would quietly void the no-PII promise. The trade-off is the
 * opposite here: mail is not load bearing for correctness, and a local
 * developer or a preview deploy without a key should still be able to walk
 * the entire signup and reset flow. Logging the link makes that possible.
 *
 * Callers must therefore never treat "sent" as proof the user received
 * anything - see how the signup route handles a failure.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const result = await deliver(message);
  /*
   * Logged AFTER the attempt and never allowed to change its outcome. The
   * import is deferred so this module stays usable by anything that does not
   * have a database - the log is an addition to sending, not a prerequisite.
   */
  const { logEmailAttempt } = await import("./db.ts");
  await logEmailAttempt({
    to: maskRecipient(message.to),
    kind: message.kind ?? "unknown",
    ok: result.ok,
    error: result.ok ? null : result.error,
  });
  return result;
}

async function deliver(message: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();

  if (!key) {
    /*
     * The body carries the link, so logging it is what makes the flow
     * testable with no provider configured. Guarded to non-production so a
     * misconfigured deployment cannot start printing reset links into logs
     * that many people can read.
     */
    if (process.env.VERCEL_ENV === "production") {
      console.error("[email] RESEND_API_KEY is not set; message not sent");
      return { ok: false, error: "email is not configured" };
    }
    console.warn(
      `[email] no RESEND_API_KEY - not sending. To: ${message.to}\n` +
        `        Subject: ${message.subject}\n${message.text}`,
    );
    return { ok: true, id: null, delivered: false };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      // A hung mail provider must not hold a request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      /*
       * The provider's own words are kept verbatim, because they are almost
       * always the entire answer - "you can only send testing emails to your
       * own email address" explained a whole afternoon of confusion in one
       * sentence, and it was sitting in a log nobody was reading.
       *
       * This detail reaches the admin log and the server log ONLY. No route
       * passes a SendResult error to an end user: /password/forgot returns
       * the same neutral message whatever happens here, and the password
       * routes ignore the result entirely. That separation is what lets this
       * string be specific.
       */
      console.error(
        `[email] provider rejected the message (${response.status}): ${detail.slice(0, 400)}`,
      );
      return { ok: false, error: `${response.status}: ${detail.slice(0, 300)}` };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? null, delivered: true };
  } catch (error) {
    console.error("[email] send failed", error);
    return { ok: false, error: "email could not be sent" };
  }
}
