/**
 * Password strength rules.
 *
 * Deliberately NOT "one uppercase, one number, one symbol". That style of
 * rule is well documented as counterproductive: it pushes people toward
 * predictable substitutions ("Password1!") that add almost no real entropy
 * while making passwords harder to remember, and it rejects genuinely strong
 * passphrases like "correct horse battery staple". NIST SP 800-63B dropped
 * composition rules for exactly this reason and recommends length plus a
 * blocklist instead.
 *
 * MINIMUM LENGTH IS 8 (set by the human, 2026-08-27, down from 12). Worth
 * being honest about the tradeoff: 8 characters is markedly weaker than 12
 * against offline cracking, and length is the single strongest predictor of
 * strength. What keeps 8 defensible here is that everything else in this
 * file still applies at that length - the blocklist, the repeated-unit,
 * keyboard-run and sequence checks, and the identity check - so the weakest
 * 8-character passwords people actually choose are still rejected. Combined
 * with scrypt hashing and the sign-in rate limit, an online guessing attack
 * stays impractical; an attacker with a stolen database dump is the case
 * where the shorter minimum genuinely costs something.
 *
 * So this checks the two things that actually predict a weak password:
 *
 *   1. LENGTH. The single strongest signal, and the only one that scales.
 *   2. WHETHER IT IS AN OBVIOUS GUESS. A short blocklist of the passwords
 *      that appear at the top of every breach corpus, plus the patterns that
 *      make a password trivially guessable regardless of length (a single
 *      repeated character, a straight keyboard run, a plain sequence).
 *
 * Also rejects a password that simply contains the account's own email local
 * part or display name - unguessable to a stranger, instantly guessable to
 * anyone who knows who they are targeting.
 *
 * Pure: no DB, no network, no React. Unit-tested in password-strength.test.ts.
 */

export const MIN_STRONG_PASSWORD_LENGTH = 8;

/**
 * The head of the common-password distribution. This is intentionally short.
 * A real deployment should check against a full corpus - the standard way is
 * Have I Been Pwned's range API, which is k-anonymous (you send the first 5
 * characters of the SHA-1 and never the password). That is a network call to
 * a third party, which is a decision for the human, not something to add
 * silently - see the security notes in SECURITY.md.
 */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "letmein",
  "welcome",
  "welcome1",
  "iloveyou",
  "admin123",
  "administrator",
  "monkey123",
  "football",
  "baseball",
  "dragon123",
  "sunshine",
  "princess",
  "trustno1",
  "starwars",
  "whatever",
  "changeme",
  "secret123",
  "linework",
  "drawtheline",
]);

/**
 * Straight runs across a QWERTY keyboard, in both directions.
 *
 * "qwertyuiop" belongs HERE and deliberately not in COMMON: keeping it out
 * of the blocklist lets the more specific "that is a straight run across the
 * keyboard" message win over the generic "too common" one, which tells the
 * user something actionable about the shape of what they typed.
 */
const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
];

export type PasswordStrengthIssue =
  | "too-short"
  | "too-common"
  | "too-repetitive"
  | "keyboard-pattern"
  | "contains-identity";

const MESSAGES: Record<PasswordStrengthIssue, string> = {
  "too-short": `Use at least ${MIN_STRONG_PASSWORD_LENGTH} characters. Length matters far more than symbols - a few unrelated words works well.`,
  "too-common": "That is one of the most commonly used passwords. Pick something else.",
  "too-repetitive": "Too repetitive. Repeating one character or a short pattern is easy to guess however long it is.",
  "keyboard-pattern": "That is a straight run across the keyboard. Pick something less predictable.",
  "contains-identity": "Do not build your password out of your own email or display name - anyone targeting you would try that first.",
};

export function passwordStrengthMessage(issue: PasswordStrengthIssue): string {
  return MESSAGES[issue];
}

/** True when the whole string is one character repeated. */
function isSingleCharacter(value: string): boolean {
  return value.length > 0 && new Set(value).size === 1;
}

/**
 * True when the string is a short unit repeated to fill the length -
 * "abcabcabcabc" is twelve characters and about as strong as "abc".
 */
function isRepeatedUnit(value: string): boolean {
  for (let unit = 1; unit <= value.length / 2; unit += 1) {
    if (value.length % unit !== 0) continue;
    const head = value.slice(0, unit);
    if (head.repeat(value.length / unit) === value) return true;
  }
  return false;
}

/**
 * Length of the longest stretch of the password that runs straight along a
 * keyboard row, in either direction.
 *
 * Finds an EMBEDDED run rather than testing the whole string: an earlier
 * version asked whether the row contained the entire password, so
 * "qwertyuiop12" was not recognised as a keyboard run at all - the two
 * trailing digits were enough to defeat it.
 */
function longestKeyboardRun(value: string): number {
  const lower = value.toLowerCase();
  let best = 0;

  for (const row of KEYBOARD_ROWS) {
    const reversed = [...row].reverse().join("");
    for (const sequence of [row, reversed]) {
      for (let start = 0; start < lower.length; start += 1) {
        for (let end = lower.length; end - start > best; end -= 1) {
          if (sequence.includes(lower.slice(start, end))) {
            best = end - start;
            break;
          }
        }
      }
    }
  }

  return best;
}

/**
 * Longest run of consecutive character codes, e.g. "abcdef" or "987654".
 * A password that is mostly a sequence is weak no matter its length.
 */
function longestSequentialRun(value: string): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < value.length; i += 1) {
    const step = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (step === 1 || step === -1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export type IdentityHints = {
  email?: string | null;
  displayName?: string | null;
};

/**
 * Returns the first problem found, or null when the password is acceptable.
 * First-problem-only on purpose: a form that lists five complaints at once
 * reads as hostile, and fixing the first usually resolves the rest.
 */
export function passwordStrengthIssue(
  password: string,
  identity: IdentityHints = {},
): PasswordStrengthIssue | null {
  const lower = password.toLowerCase();

  /*
   * The blocklist is checked BEFORE length on purpose. "password123" is
   * eleven characters, and answering "too short" invites the user to add one
   * character to a password that sits near the top of every breach corpus -
   * technically satisfying the rule while remaining trivially guessable.
   * Naming the real problem is the only feedback worth giving.
   */
  if (COMMON.has(lower)) return "too-common";

  // Strip trailing digits before re-checking: "password2024" is "password".
  const withoutTrailingDigits = lower.replace(/\d+$/, "");
  if (withoutTrailingDigits.length >= 4 && COMMON.has(withoutTrailingDigits)) {
    return "too-common";
  }

  if (password.length < MIN_STRONG_PASSWORD_LENGTH) return "too-short";

  if (isSingleCharacter(password) || isRepeatedUnit(lower)) return "too-repetitive";

  if (longestKeyboardRun(password) >= 6) return "keyboard-pattern";

  // More than half the password being one straight sequence.
  if (longestSequentialRun(password) >= Math.max(6, password.length / 2)) {
    return "keyboard-pattern";
  }

  const local = identity.email?.split("@")[0]?.toLowerCase().trim();
  if (local && local.length >= 4 && lower.includes(local)) return "contains-identity";

  const name = identity.displayName?.toLowerCase().trim();
  if (name && name.length >= 4 && lower.includes(name)) return "contains-identity";

  return null;
}

/**
 * A coarse 0-4 score, for the signup form's strength meter only. Never used
 * to accept or reject - passwordStrengthIssue() is the only gate. A meter
 * exists to encourage, not to adjudicate.
 */
export function passwordScore(password: string): number {
  if (password.length === 0) return 0;
  if (passwordStrengthIssue(password) !== null) return password.length >= 8 ? 1 : 0;

  let score = 2;
  if (password.length >= 16) score += 1;
  if (password.length >= 20 || /\s/.test(password)) score += 1;
  return Math.min(4, score);
}
