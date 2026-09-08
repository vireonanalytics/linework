import { randomBytes, createHash } from "node:crypto";

/**
 * Minting and hashing for email verification and password-reset tokens.
 *
 * Pure and dependency-free so it can be unit tested without a database or a
 * mail provider, in keeping with every other module under lib/server.
 */

/**
 * 32 bytes = 256 bits of entropy, base64url encoded so it survives being
 * pasted into a URL, an email client's link rewriter, and a copy-paste out of
 * a plain-text body without needing escaping.
 *
 * Length is a security parameter, not a cosmetic one: the whole defence for a
 * reset link is that it cannot be guessed, since anyone holding it can set a
 * password. There is no rate limit that makes a short token safe, because an
 * attacker guessing tokens is indistinguishable from users following links.
 */
const TOKEN_BYTES = 32;

/*
 * Only one purpose remains. A 'verify_email' token existed until 2026-08-27,
 * when address confirmation was removed for gating nothing. The map is kept
 * rather than flattened to a constant because the database column and its
 * CHECK constraint are still purpose-keyed, and a second kind of link (a
 * sign-in link, say) is the sort of thing that turns up later.
 */
export const TOKEN_TTL_MS = {
  /*
   * Deliberately short. This link IS the account for as long as it lives, so
   * the window in which a leaked inbox, a shared screen or a forwarded thread
   * can be turned into a takeover should be small.
   */
  reset_password: 60 * 60 * 1000,
} as const;

export type TokenPurpose = keyof typeof TOKEN_TTL_MS;

export type MintedToken = {
  /** Goes in the email. Never stored, never logged. */
  raw: string;
  /** Goes in the database. */
  hash: string;
  expiresAt: Date;
};

/**
 * Hash a token for storage or lookup.
 *
 * Plain sha256, no salt and no pepper - see the migration's header for the
 * full reasoning. Short version: the input is 256 bits of uniform randomness,
 * so there is no dictionary to precompute and nothing for a salt to defeat;
 * and the token is FOUND by its hash, which a per-row salt would make
 * impossible without scanning every row.
 */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintToken(purpose: TokenPurpose, now = new Date()): MintedToken {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  };
}

/**
 * Build the link that goes in the email.
 *
 * The token travels as a query parameter, which is unavoidable for a link in
 * an email. That is exactly why these tokens are single-use and short-lived:
 * a URL leaks more readily than a request body - into browser history, into
 * referrer headers, into server logs - so the design assumes the link WILL be
 * seen by something other than its recipient and limits what that is worth.
 *
 * `appUrl` comes from configuration rather than from the incoming request.
 * Deriving it from a Host header would let an attacker who can set that
 * header mint a valid-looking link pointing at their own domain and harvest
 * tokens from anyone who clicks - the classic host-header poisoning route
 * into a password-reset flow.
 */
export function tokenLink(
  appUrl: string,
  path: "/reset",
  rawToken: string,
): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}${path}?token=${encodeURIComponent(rawToken)}`;
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
