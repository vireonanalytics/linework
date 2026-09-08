/**
 * The two datasets playable with no account, same for every visitor.
 *
 * CHANGED 2026-08-27. These used to be `us-gun-homicide-rate` and
 * `global-child-vaccination-rate`, both hand-authored and both rated RED -
 * their values are interpolations between anchor points, not the source's
 * own series. When the 331 imported charts went live those two went
 * inactive, which would have left the homepage with nothing to show at all.
 *
 * Replaced with two GREEN World Bank series carrying exact annual values.
 * The intro charts are the first thing anyone sees and the only ones an
 * anonymous visitor ever plays, so they should be the best-sourced charts
 * in the set, not the oldest.
 *
 * Single source of truth for the slug list - app/page.tsx renders these two
 * datasets directly, and app/api/guess/route.ts reads this same list to
 * decide which anonymous guesses do NOT get written to the database (see
 * that file's comment: "the initial two questions without registration
 * should not go into the database" - a human's explicit instruction,
 * 2026-08-26, and a deliberate carve-out from this project's original
 * anonymous-by-default collection design; see docs/DESIGN.md).
 */
export const FREE_INTRO_SLUGS: readonly string[] = [
  // Child mortality worldwide. The single most reliably misperceived trend
  // there is - most people believe it has got worse or stayed flat, and it
  // has more than halved. Exactly the gap this project exists to measure.
  "under-five-mortality-wld",
  // World life expectancy. Same shape of misperception, different domain,
  // and it reads clearly at a glance.
  "life-expectancy-wld",
];
