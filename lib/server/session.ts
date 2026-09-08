/**
 * Anonymous session identity.
 *
 * A random UUID in an httpOnly cookie. No auth, no login, no identifier that
 * means anything outside this database. The cookie is httpOnly so page scripts
 * cannot read it, sameSite=lax so it is not sent on cross-site subrequests,
 * and secure everywhere except plain-http local development - which includes
 * the LAN dev server used for phone testing, or the cookie would be dropped.
 */

export const SESSION_COOKIE = "dtl_session";
export const REFERRER_COOKIE = "dtl_ref";

/** A session is one sitting, not a person. Thirty days is generous for that. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionId(value: string | undefined | null): boolean {
  return typeof value === "string" && UUID_V4.test(value);
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(requestUrl: string): CookieOptions {
  let secure = true;
  try {
    // http://192.168.x.x:3000 during phone testing must still set the cookie.
    secure = new URL(requestUrl).protocol === "https:";
  } catch {
    secure = true;
  }

  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
