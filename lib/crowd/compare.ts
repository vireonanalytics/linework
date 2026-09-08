import { PATH_MAX } from "../drawing/resample.ts";

/**
 * "You vs everyone" - comparing one player's guess against the crowd's
 * precomputed percentile bands, in plain language.
 *
 * Pure. Takes percentiles and paths already on the stored 0..1000 scale;
 * knows nothing about Postgres, React, or where the numbers came from.
 */

export type CrowdPercentiles = {
  p25: number[];
  p50: number[];
  p75: number[];
};

export type BiasDirection = "too-high" | "too-low" | "on-target";
export type OverallPosition = "below-crowd" | "within-crowd" | "above-crowd";

export type CrowdComparison = {
  n: number;
  /** Where the player's line sat relative to the crowd's middle 50%, overall. */
  overallPosition: OverallPosition;
  /** Fraction of the 40 points above p75 / below p25 / within the band. */
  fractionAbove: number;
  fractionBelow: number;
  fractionWithin: number;
  /** The player's own bias against the truth. */
  playerBias: BiasDirection;
  /** The crowd's median bias against the truth - what most people got wrong. */
  crowdBias: BiasDirection;
  /** True when the player was wrong in the same direction as the crowd. */
  agreesWithCrowd: boolean;
};

/**
 * Below this, a signed difference on the 0..1000 scale is treated as noise
 * rather than a real lean. 10 is 1% of the domain - the same threshold
 * DrawTheLine.tsx already uses for its own "drew too high/low" read-out
 * (0.01 on the 0..1 normalised scale = 10 here), so the two labels never
 * disagree about the same guess.
 */
const BIAS_EPSILON = 10;

function meanDelta(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] - b[i];
  return sum / a.length;
}

function biasFrom(delta: number): BiasDirection {
  if (delta > BIAS_EPSILON) return "too-high";
  if (delta < -BIAS_EPSILON) return "too-low";
  return "on-target";
}

function majorityPosition(
  fractionAbove: number,
  fractionBelow: number,
): OverallPosition {
  if (fractionAbove >= 0.5) return "above-crowd";
  if (fractionBelow >= 0.5) return "below-crowd";
  return "within-crowd";
}

export function compareToCrowd(
  playerPath: number[],
  truthPath: number[],
  percentiles: CrowdPercentiles,
  n: number,
): CrowdComparison {
  const { p25, p50, p75 } = percentiles;

  if (
    playerPath.length !== truthPath.length ||
    playerPath.length !== p25.length ||
    playerPath.length !== p50.length ||
    playerPath.length !== p75.length
  ) {
    throw new Error("compareToCrowd: all paths must be the same length");
  }

  let above = 0;
  let below = 0;

  for (let i = 0; i < playerPath.length; i += 1) {
    if (playerPath[i] > p75[i]) above += 1;
    else if (playerPath[i] < p25[i]) below += 1;
  }

  const count = playerPath.length;
  const fractionAbove = above / count;
  const fractionBelow = below / count;

  return {
    n,
    overallPosition: majorityPosition(fractionAbove, fractionBelow),
    fractionAbove,
    fractionBelow,
    fractionWithin: 1 - fractionAbove - fractionBelow,
    playerBias: biasFrom(meanDelta(playerPath, truthPath)),
    crowdBias: biasFrom(meanDelta(p50, truthPath)),
    agreesWithCrowd:
      biasFrom(meanDelta(playerPath, truthPath)) ===
      biasFrom(meanDelta(p50, truthPath)),
  };
}

const POSITION_TEXT: Record<OverallPosition, string> = {
  "within-crowd": "Your line landed in the thick of it — inside the middle 50% of everyone's guesses.",
  "above-crowd": "You drew higher than most people — outside the middle 50%, on the high side.",
  "below-crowd": "You drew lower than most people — outside the middle 50%, on the low side.",
};

/**
 * Two short sentences: where the player sat relative to the crowd, and
 * whether their bias matched the crowd's. Plain language, no jargon, no
 * numbers beyond what a reader needs to trust the claim.
 */
export function describeComparison(comparison: CrowdComparison): {
  position: string;
  bias: string;
} {
  const { playerBias, crowdBias, agreesWithCrowd } = comparison;

  let bias: string;
  if (crowdBias === "on-target") {
    bias =
      playerBias === "on-target"
        ? "Like the crowd's median guess, yours was right on the line."
        : playerBias === "too-high"
          ? "Most people landed on target here — you drew higher than the real trend."
          : "Most people landed on target here — you drew lower than the real trend.";
  } else if (agreesWithCrowd) {
    bias =
      crowdBias === "too-high"
        ? "Like most people, you overestimated where the line was headed."
        : "Like most people, you underestimated how far it fell.";
  } else {
    bias =
      playerBias === "on-target"
        ? `Unlike most people, who ${crowdBias === "too-high" ? "overestimated" : "underestimated the drop"}, you drew right on the line.`
        : playerBias === "too-high"
          ? "Unlike most people, who underestimated the drop, you overestimated it."
          : "Unlike most people, who overestimated where the line was headed, you underestimated it.";
  }

  return { position: POSITION_TEXT[comparison.overallPosition], bias };
}

/** Sanity guard: every value going into a comparison must be on the stored scale. */
export function assertOnStoredScale(values: number[]): void {
  for (const value of values) {
    if (value < 0 || value > PATH_MAX) {
      throw new Error(`value ${value} is outside the stored 0..${PATH_MAX} scale`);
    }
  }
}
