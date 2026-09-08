/**
 * Judging whether a submitted guess looks like deliberate junk.
 *
 * This is NOT "was the player wrong". Being wrong is the entire point of the
 * game and the whole reason the dataset is worth collecting - a confidently
 * wrong line is the most valuable row in the table. Penalising wrongness
 * would destroy exactly the signal this project exists to measure, and would
 * teach players to draw what they think is expected rather than what they
 * believe. That would be far worse for the research than any amount of junk.
 *
 * So this looks only for shapes that carry no belief at all:
 *
 *   - PINNED: the line is flat against the very top or very bottom of the
 *     chart for nearly its whole length. Nobody believes a rate went to
 *     exactly the axis maximum and stayed there; that is a finger dragged
 *     along an edge.
 *   - SCRIBBLE: the line reverses direction implausibly often. Real
 *     predictions are mostly monotonic or single-turn; twenty reversals
 *     across forty points is someone shaking the cursor.
 *   - EXTREME SPAN: the line covers nearly the entire vertical range in a
 *     single sweep, repeatedly crossing from floor to ceiling.
 *
 * Every threshold below is deliberately loose. A false positive here tells a
 * real person their honest answer was junk, which is both insulting and
 * likely to make them leave; a false negative just leaves one bad row among
 * many, which the existing suspect-flagging and the n>=50 aggregate
 * threshold already absorb. When unsure, this returns null.
 *
 * Pure: takes a quantised path and nothing else. Unit-tested.
 */

import { PATH_MAX } from "../drawing/resample.ts";

export type LowEffortReason = "pinned-to-edge" | "scribble" | "full-range-sweep";

/** How many strikes before the player sees a warning. */
export const WARN_AFTER_STRIKES = 2;

/** How many before the account is flagged for an admin to look at. */
export const FLAG_AFTER_STRIKES = 4;

/** Within this distance of an edge counts as "on" it. 2% of the scale. */
const EDGE_BAND = PATH_MAX * 0.02;

/** This fraction of points sitting on one edge makes it pinned. */
const PINNED_FRACTION = 0.9;

/** More direction changes than this across the path reads as a scribble. */
const SCRIBBLE_REVERSALS = 14;

/** A single step covering this much of the scale is implausibly steep. */
const BIG_JUMP = PATH_MAX * 0.55;

/** This many big jumps means the line is sweeping the full range repeatedly. */
const BIG_JUMP_COUNT = 3;

const MESSAGES: Record<LowEffortReason, string> = {
  "pinned-to-edge":
    "That line sat flat against the edge of the chart.",
  scribble:
    "That line changed direction a lot of times.",
  "full-range-sweep":
    "That line swept the full height of the chart several times.",
};

/**
 * What the player is told. Deliberately explains WHY the data matters rather
 * than accusing them - most people who trip this are messing about for a
 * moment, not attacking the project, and being told what the site is for is
 * more likely to change that than being told off.
 */
export function lowEffortNotice(reason: LowEffortReason): string {
  return (
    `${MESSAGES[reason]} Every line drawn here becomes part of a public research ` +
    `dataset about what people believe, so a guess that is not a real guess ` +
    `makes that dataset worse for everyone. Being wrong is genuinely fine and ` +
    `useful - that is the whole point. Answers that are not real answers are not.`
  );
}

function countReversals(path: number[]): number {
  let reversals = 0;
  let lastDirection = 0;

  for (let i = 1; i < path.length; i += 1) {
    const delta = path[i] - path[i - 1];
    // Ignore flat steps - a plateau is not a direction change, and treating
    // it as one would flag any line with a deliberate hold in it.
    if (delta === 0) continue;
    const direction = delta > 0 ? 1 : -1;
    if (lastDirection !== 0 && direction !== lastDirection) reversals += 1;
    lastDirection = direction;
  }

  return reversals;
}

function countBigJumps(path: number[]): number {
  let jumps = 0;
  for (let i = 1; i < path.length; i += 1) {
    if (Math.abs(path[i] - path[i - 1]) >= BIG_JUMP) jumps += 1;
  }
  return jumps;
}

/**
 * Returns a reason when the path looks like deliberate junk, else null.
 *
 * @param path Quantised guess, each value 0..PATH_MAX.
 */
export function lowEffortReason(path: number[]): LowEffortReason | null {
  if (path.length < 4) return null;

  const onTop = path.filter((v) => v >= PATH_MAX - EDGE_BAND).length;
  const onBottom = path.filter((v) => v <= EDGE_BAND).length;
  const threshold = path.length * PINNED_FRACTION;
  if (onTop >= threshold || onBottom >= threshold) return "pinned-to-edge";

  if (countBigJumps(path) >= BIG_JUMP_COUNT) return "full-range-sweep";

  if (countReversals(path) >= SCRIBBLE_REVERSALS) return "scribble";

  return null;
}
