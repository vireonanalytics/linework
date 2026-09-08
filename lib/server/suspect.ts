/**
 * Data quality at write time.
 *
 * Flagged rows are stored, never silently dropped - throwing away a suspicious
 * row means you can never audit the decision or change your mind about the
 * rule. They are excluded from published aggregates instead, and the reasons
 * ride along so an exclusion can always be explained.
 *
 * Pure. No database, no request, no clock.
 */

export type SuspectReason =
  | "zero-variance"
  | "too-fast"
  | "duplicate-in-session"
  | "headless-agent";

/** Anything drawn faster than this was not drawn by a person deciding. */
export const MIN_PLAUSIBLE_DRAW_MS = 300;

/**
 * Automation that identifies itself. This will never catch a determined
 * scraper, and it is not meant to - it catches the honest majority of
 * non-human traffic so the aggregates are not quietly poisoned by it.
 */
const HEADLESS_PATTERN =
  /headless|phantomjs|puppeteer|playwright|selenium|webdriver|electron|\bbot\b|crawler|spider|scrapy|curl\/|wget|python-requests|node-fetch|axios\/|okhttp|java\/|go-http-client|lighthouse|pingdom|gtmetrix/i;

export function isHeadlessAgent(userAgent: string | null | undefined): boolean {
  // A real browser always sends a user agent. An absent or stub one is itself
  // the signal.
  if (!userAgent || userAgent.trim().length < 8) return true;
  return HEADLESS_PATTERN.test(userAgent);
}

/** True when every point is identical - a straight horizontal drag. */
export function hasZeroVariance(path: readonly number[]): boolean {
  if (path.length === 0) return true;
  return path.every((value) => value === path[0]);
}

export type SuspectInput = {
  path: readonly number[];
  drawMs: number;
  /** Whether this session already has a guess for this dataset. */
  isDuplicate: boolean;
  userAgent: string | null | undefined;
};

export type SuspectVerdict = {
  isSuspect: boolean;
  reasons: SuspectReason[];
};

export function assessGuess({
  path,
  drawMs,
  isDuplicate,
  userAgent,
}: SuspectInput): SuspectVerdict {
  const reasons: SuspectReason[] = [];

  if (hasZeroVariance(path)) reasons.push("zero-variance");
  if (drawMs < MIN_PLAUSIBLE_DRAW_MS) reasons.push("too-fast");
  if (isDuplicate) reasons.push("duplicate-in-session");
  if (isHeadlessAgent(userAgent)) reasons.push("headless-agent");

  return { isSuspect: reasons.length > 0, reasons };
}

/**
 * Coarse device bucket. Three values and "unknown" - deliberately too blunt to
 * help identify anyone, which is the only reason it is safe to store.
 */
export function deviceTypeFrom(
  userAgent: string | null | undefined,
): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(userAgent)) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(userAgent)) {
    return "mobile";
  }
  if (/mozilla|chrome|safari|firefox|edge/i.test(userAgent)) return "desktop";
  return "unknown";
}

/**
 * Host only, lowercased. Never the full referring URL - those carry query
 * strings, and query strings carry things people did not mean to send us.
 */
export function referrerHostFrom(
  referer: string | null | undefined,
  ownHost?: string | null,
): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    // Our own pages are not a referrer worth recording.
    if (ownHost && host === ownHost.toLowerCase()) return null;
    return host || null;
  } catch {
    return null;
  }
}
