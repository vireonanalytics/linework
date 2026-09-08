/**
 * `todayUtc()` - the single definition of "today" used anywhere a streak or
 * daily count needs a calendar date, e.g. lib/server/db.ts's
 * maybeAdvanceStreak(). UTC, not local wall clock, so every server instance
 * agrees on what day it is regardless of its own timezone.
 *
 * This module used to also hold a deterministic "same five charts for
 * everyone" daily-run selector. Removed 2026-08-26: there is no longer a
 * separate daily run to select for - signed-in play now works through the
 * active dataset pool one chart at a time (see lib/server/db.ts's
 * nextChartForUser and components/SignedInPlay.tsx), and the streak already
 * counts any 3 distinct charts completed in a day, not a specific
 * pre-selected five. Kept in its own file rather than folded into db.ts
 * because it is pure and still worth testing in isolation.
 */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
