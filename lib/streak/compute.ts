/**
 * Streak state transitions. Pure - no database, no clock, no React. The
 * caller supplies "today" as an ISO date string (YYYY-MM-DD, UTC) so the
 * daily run stays genuinely the same day for everyone regardless of local
 * timezone, the same spirit as the daily run itself being date-keyed.
 *
 * Mechanic, decided 2026-08-26 (the human chose "Duolingo-style earned
 * freezes" over no-freeze or a flat grace day):
 *
 *   - Completing 3+ charts in a day counts as a qualifying day.
 *   - The day right after a qualifying day: streak continues (+1).
 *   - Exactly one day skipped, with a freeze banked: the freeze auto-consumes
 *     and the streak continues as if the gap were not there. A freeze
 *     protects exactly ONE missed day - two or more in a row still resets,
 *     freeze or not. That specific cutoff was not specified by the human and
 *     is this module's own default; it is easy to change in one place if a
 *     softer or harsher rule turns out to be wanted.
 *   - Anything worse than that: the streak resets, and today starts a new
 *     one at 1 (not 0 - the qualifying day that triggered this call is
 *     itself day one of the new streak).
 *   - Every FREEZE_EARN_INTERVAL-day milestone banks one freeze, capped at
 *     MAX_BANKED_FREEZES. Freezes are EARNED only. Nothing in this project
 *     sells them - that would need a payment provider, which is a real
 *     decision this module does not make. See docs/DESIGN.md.
 */

export const STREAK_QUALIFYING_CHARTS = 3;
export const FREEZE_EARN_INTERVAL = 7;
export const MAX_BANKED_FREEZES = 3;

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  /** ISO date (YYYY-MM-DD) of the last qualifying day, or null if never. */
  lastActiveDate: string | null;
  freezesAvailable: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type QualifyingDayOutcome = {
  next: StreakState;
  /** What happened, for a UI to explain ("streak continued", "freeze used", ...). */
  event: "started" | "continued" | "freeze-used" | "reset" | "already-counted";
  freezeEarned: boolean;
};

/**
 * Call exactly once, at the moment a player's chart-completion count for
 * `today` first reaches STREAK_QUALIFYING_CHARTS. Calling it again the same
 * day is safe (a no-op) but should not be relied on as the normal path - the
 * caller owns knowing when the threshold was just crossed.
 */
export function recordQualifyingDay(
  state: StreakState,
  today: string,
): QualifyingDayOutcome {
  if (!ISO_DATE.test(today)) {
    throw new Error(`recordQualifyingDay: "${today}" is not an ISO date`);
  }

  if (state.lastActiveDate === today) {
    return { next: state, event: "already-counted", freezeEarned: false };
  }

  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;

  if (gap !== null && gap <= 0) {
    throw new Error(
      `recordQualifyingDay: today (${today}) is not after lastActiveDate (${state.lastActiveDate})`,
    );
  }

  let nextStreakCount: number;
  let freezesAvailable = state.freezesAvailable;
  let event: QualifyingDayOutcome["event"];

  if (gap === null) {
    nextStreakCount = 1;
    event = "started";
  } else if (gap === 1) {
    nextStreakCount = state.currentStreak + 1;
    event = "continued";
  } else if (gap === 2 && state.freezesAvailable > 0) {
    freezesAvailable -= 1;
    nextStreakCount = state.currentStreak + 1;
    event = "freeze-used";
  } else {
    nextStreakCount = 1;
    event = "reset";
  }

  const freezeEarned =
    nextStreakCount > 0 &&
    nextStreakCount % FREEZE_EARN_INTERVAL === 0 &&
    freezesAvailable < MAX_BANKED_FREEZES;

  if (freezeEarned) freezesAvailable += 1;

  return {
    next: {
      currentStreak: nextStreakCount,
      longestStreak: Math.max(state.longestStreak, nextStreakCount),
      lastActiveDate: today,
      freezesAvailable,
    },
    event,
    freezeEarned,
  };
}

export const EMPTY_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  freezesAvailable: 0,
};
