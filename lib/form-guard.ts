/**
 * Bot heuristics for form submissions, and the field name the honeypot uses.
 *
 * Lives OUTSIDE lib/server on purpose. The signup form is a client component
 * and needs the honeypot's field name, and this module has to be importable
 * from the browser bundle without dragging anything server-only with it.
 * It was originally inside lib/server/guard.ts, which imports the database
 * module - importing that from the client pulled the entire Postgres driver
 * into the browser build and broke it outright (Module not found: 'net',
 * 'tls', 'fs'). Pure logic that both sides need belongs here.
 *
 * Bot heuristics for form submissions.
 *
 * Two signals, both free and both invisible to a real person:
 *
 *   1. A HONEYPOT field the form renders but hides. A human never fills it
 *      because they never see it; a naive bot fills every input it finds.
 *   2. TIME TO SUBMIT. A person cannot read a signup form, choose a
 *      password and submit in under a couple of seconds. A script can do it
 *      in milliseconds.
 *
 * Neither stops a determined attacker who looks at the markup once - and
 * that is understood. They exist to remove the large, cheap, indiscriminate
 * majority of automated signups at zero cost to real users and with no
 * third-party dependency. A real CAPTCHA (Turnstile / hCaptcha) is the next
 * step up and is a decision for the human: it means a new external service
 * and a small accessibility cost. See the security notes in SECURITY.md.
 */
export const HONEYPOT_FIELD = "website";

/** Minimum plausible time between a form rendering and a human submitting it. */
export const MIN_FORM_FILL_MS = 2500;

export type BotVerdict = { looksAutomated: boolean; reason?: string };

export function screenFormSubmission(raw: Record<string, unknown>): BotVerdict {
  const honeypot = raw[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return { looksAutomated: true, reason: "honeypot" };
  }

  const renderedAt = raw.formRenderedAt;
  if (typeof renderedAt === "number" && Number.isFinite(renderedAt)) {
    const elapsed = Date.now() - renderedAt;
    /*
     * Only a suspiciously FAST submission counts. A slow one means nothing -
     * people leave tabs open for hours - and a negative elapsed time means a
     * clock skew, not an attack, so neither is treated as a signal.
     */
    if (elapsed >= 0 && elapsed < MIN_FORM_FILL_MS) {
      return { looksAutomated: true, reason: "submitted-too-fast" };
    }
  }

  return { looksAutomated: false };
}
