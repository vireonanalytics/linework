import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the Credentials auth provider.
 *
 * scrypt via node:crypto, built in - no new dependency for something this
 * project already has a hand-rolled hashing module for (lib/server/hash.ts).
 * That module uses one shared server-side pepper because it hashes user
 * agents, a small space of real-world strings where a single secret is what
 * makes the hash irreversible. Passwords are different: each one needs its
 * own random salt, or two users with the same password would produce the
 * same hash and leak that fact to anyone with database access.
 *
 * Stored format: `<saltHex>:<hashHex>`, self-contained - the salt travels
 * with the hash, nothing external is needed to verify a password later.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(password, salt, KEY_LENGTH);

  // timingSafeEqual throws on length mismatch rather than returning false,
  // and expected.length is already checked above, so actual (always
  // KEY_LENGTH bytes) can never mismatch it going in.
  return timingSafeEqual(actual, expected);
}

export type PasswordIssue = "too-short" | "too-long" | "empty";

/**
 * Deliberately minimal. No forced mix of character classes - that pushes
 * people toward predictable substitutions ("Password1!") without adding real
 * entropy. Length is what actually matters.
 */
export function passwordIssue(password: string): PasswordIssue | null {
  if (password.length === 0) return "empty";
  if (password.length < MIN_PASSWORD_LENGTH) return "too-short";
  // scrypt's underlying cipher has a practical input ceiling; nowhere near a
  // real password, but worth rejecting explicitly rather than erroring deep
  // inside scryptSync.
  if (password.length > 512) return "too-long";
  return null;
}
