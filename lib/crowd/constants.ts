/**
 * Shared between the app and the SQL side of crowd aggregation.
 *
 * CROWD_SAMPLE_SIZE has a matching `sample_size` constant hardcoded inside
 * recompute_crowd_stats() in supabase/migrations/20260826150914_crowd_stats.sql.
 * There is no automatic check across that boundary - SQL cannot import a
 * TypeScript constant - so if this number changes, that migration's constant
 * has to change with it, by hand, in the same commit.
 */
export const CROWD_SAMPLE_SIZE = 500;

/**
 * The cold-start guardrail from docs/DESIGN.md: never render crowd percentile
 * bands below this many unflagged guesses. Below it, show the raw count
 * instead. Never present noise as consensus.
 */
export const CROWD_MIN_N = 50;

export function hasEnoughCrowd(n: number): boolean {
  return n >= CROWD_MIN_N;
}
