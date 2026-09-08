/**
 * Screening for display names.
 *
 * WHAT THIS IS AND IS NOT. This is a coarse first filter, not a moderation
 * system. It catches the obvious and the lazy: slurs, explicit sexual terms,
 * and names that impersonate this site's own staff. It will not catch a
 * determined person, and it is not supposed to - the real backstop is a human
 * with a block button (see the admin user list), which is exactly why that
 * exists rather than this being tuned harder.
 *
 * The failure mode to avoid here is over-blocking. A filter that rejects
 * "Scunthorpe" or a real surname is worse than one that lets a rude name
 * through for a few hours until someone reviews it, because the first breaks
 * signup for real people with no recourse and the second is reversible. So:
 *
 *   - matching is on WHOLE WORDS, never substrings. This is the single most
 *     important decision in the file. Substring matching is the classic
 *     source of false positives ("Scunthorpe", "Penistone", "assess",
 *     "class", "Dickens" all contain a banned substring).
 *   - leetspeak is normalised before matching, so "f4gg0t" is caught, but
 *     normalisation happens on a copy and never changes what gets stored.
 *   - the impersonation list is exact-match-ish and deliberately narrow.
 *
 * Pure. No network, no DB, no React. Unit-tested in name-screen.test.ts.
 */

/**
 * Slurs and explicit terms, as whole words only. Kept short and specific.
 * A longer list is not obviously better - it mostly adds false positives -
 * and a serious deployment would use a maintained list behind this same
 * interface rather than growing this array.
 */
const BLOCKED_WORDS = new Set([
  // Racial and ethnic slurs.
  "nigger", "nigga", "chink", "spic", "kike", "wetback", "gook", "coon",
  "raghead", "towelhead", "paki",
  // Homophobic and transphobic slurs.
  "faggot", "fag", "tranny", "dyke",
  // Ableist slurs.
  "retard", "retarded",
  // Explicit sexual terms. Not exhaustive; the obvious ones only.
  "cunt", "whore", "slut", "rapist", "pedo", "pedophile", "paedophile",
  "molester", "incest", "bestiality",
  // Hate symbols and figures used as handles.
  "hitler", "nazi", "adolfhitler", "kkk", "heilhitler",
]);

/**
 * Names that would let someone pose as this site or its operators. Matched
 * against the whole normalised name, not word by word, because "linework
 * support" is the impersonation - "linework" alone is not.
 */
const IMPERSONATION = [
  "admin", "administrator", "moderator", "mod", "staff", "support",
  "linework", "lineworkteam", "lineworkstaff", "lineworksupport",
  "lineworkadmin", "official", "officialaccount", "system", "root",
  "help", "helpdesk", "security", "billing", "noreply", "no-reply",
];

/**
 * Leetspeak and lookalike normalisation, applied to a COPY before matching.
 * Turns "n1gg3r" and "f4g" into their plain forms so the word list does not
 * need a variant for every substitution.
 */
const LOOKALIKES: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "6": "g",
};

function normalise(value: string): string {
  return value
    .toLowerCase()
    // Strip accents so "nïgger" normalises too.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split("")
    .map((char) => LOOKALIKES[char] ?? char)
    .join("");
}

/**
 * Split into word-ish tokens on any non-letter, non-number boundary.
 *
 * UNICODE-AWARE, and that is not a nicety. An earlier version split on
 * `[^a-z0-9]+`, which silently discarded every character outside the Latin
 * alphabet - so "\u674e\u96f7", "\u041c\u0430\u0440\u0438\u044f" and
 * "\u0645\u062d\u0645\u062f" all tokenised to nothing and were rejected as
 * "not a name". That would have blocked signup for most of the world while
 * looking like it worked, because every test name happened to be Latin.
 */
function tokens(normalised: string): string[] {
  return normalised.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export type NameIssue = "blocked-word" | "impersonation" | "not-a-name";

const MESSAGES: Record<NameIssue, string> = {
  "blocked-word": "That display name contains language we do not allow. Pick another.",
  impersonation: "That display name could be mistaken for Linework staff. Pick another.",
  "not-a-name": "Display names need at least one letter or number.",
};

export function nameIssueMessage(issue: NameIssue): string {
  return MESSAGES[issue];
}

/**
 * Returns the first problem found, or null when the name is acceptable.
 *
 * Only ever called on a name that has already passed the length and
 * control-character checks in validate-signup.ts - this adds the content
 * judgement, not the structural one.
 */
export function screenDisplayName(displayName: string): NameIssue | null {
  /*
   * Tested against the ORIGINAL string, before normalisation. normalise()
   * maps lookalike punctuation onto letters ("!" becomes "i"), so a name of
   * pure punctuation like "!!!" would otherwise normalise into "iii" and
   * read as a perfectly good word.
   */
  if (!/[\p{L}\p{N}]/u.test(displayName)) return "not-a-name";

  const normalised = normalise(displayName);
  const words = tokens(normalised);

  if (words.length === 0) return "not-a-name";

  for (const word of words) {
    if (BLOCKED_WORDS.has(word)) return "blocked-word";
  }

  /*
   * Also check the name with all separators removed, so "n i g g e r" and
   * "n.i.g.g.e.r" do not walk straight through the word-boundary rule. Only
   * an exact match against the joined form counts - a substring check here
   * would reintroduce every false positive the word list avoids.
   */
  const joined = words.join("");
  if (BLOCKED_WORDS.has(joined)) return "blocked-word";

  if (IMPERSONATION.includes(joined)) return "impersonation";

  return null;
}
