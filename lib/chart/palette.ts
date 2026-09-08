/**
 * Which ink pair a given chart prints in.
 *
 * "Every other graph should be a different colour" (2026-08-27). The colours
 * themselves are defined as .chart-theme--N classes in app/tokens.css - this
 * module only decides WHICH one a dataset gets, and returns a class name.
 * Nothing here knows a hex value, which is what keeps the "colour lives in
 * tokens.css only" rule true.
 *
 * Chosen by hashing the slug rather than by dataset id or array position, so:
 *
 *  - a dataset keeps the same colours forever, for everyone, no matter what
 *    order it was seeded in or how many datasets exist around it;
 *  - two people comparing notes on the same chart saw the same thing;
 *  - adding a dataset never re-colours the existing ones, which an
 *    index-based rotation would do every time the list grew.
 *
 * Pure: no React, no DOM, no database. Same constraint as the rest of lib/chart.
 */

/** Must match the number of .chart-theme--N classes defined in app/tokens.css. */
export const CHART_THEME_COUNT = 6;

/** FNV-1a, the same small string hash lib/daily/select.ts uses. Not cryptographic; does not need to be. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The theme class for a dataset. Returns e.g. "chart-theme--3".
 *
 * Falls back to theme 1 for an empty slug rather than throwing: a missing
 * colour is a cosmetic problem and must never be able to take down a chart
 * that is otherwise fine.
 */
export function chartThemeClass(slug: string): string {
  if (!slug) return "chart-theme--1";
  return `chart-theme--${(fnv1a(slug) % CHART_THEME_COUNT) + 1}`;
}
