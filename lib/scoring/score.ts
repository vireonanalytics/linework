import { PATH_POINTS } from "../drawing/resample.ts";

/**
 * The only part of a dataset scoring needs.
 *
 * Narrower than Dataset on purpose: the server scores against a row read back
 * from the database, not against the hardcoded module, and it should not have
 * to fake a full Dataset to do that.
 */
export type ScorableSeries = {
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
};

export type ScoreResult = {
  /** 0..100. 100 is a perfect trace. */
  score: number;
  /** Mean |guess - truth| in normalised 0..1 units. */
  meanAbsError: number;
  /**
   * Mean (guess - truth) in normalised 0..1 units. Positive means the player
   * drew too high. This is the column the research output is built on.
   */
  meanSignedError: number;
};

/**
 * The truth in the drawable region, resampled onto the same 40 x positions the
 * guess uses, in normalised 0..1 units.
 *
 * The series has one point per year, but a guess always has 40 points, so the
 * two are not directly comparable until the truth is resampled the same way.
 */
export function truthPathNormalized(
  dataset: ScorableSeries,
  count: number = PATH_POINTS,
): number[] {
  const { yValues, yDomain, revealFromIndex } = dataset;
  const lastIndex = yValues.length - 1;
  const [domainMin, domainMax] = yDomain;
  const domainSpan = domainMax - domainMin || 1;
  const indexSpan = lastIndex - revealFromIndex;

  const out = new Array<number>(count);

  for (let i = 0; i < count; i += 1) {
    const position = revealFromIndex + (indexSpan * i) / (count - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, lastIndex);
    const t = position - lower;
    const value = yValues[lower] + t * (yValues[upper] - yValues[lower]);
    out[i] = (value - domainMin) / domainSpan;
  }

  return out;
}

/**
 * Compare a guess against the truth. Both arrays are normalised 0..1 across the
 * dataset's yDomain and must be the same length.
 */
export function scoreGuess(guess: number[], truth: number[]): ScoreResult {
  if (guess.length !== truth.length) {
    throw new Error(
      `scoreGuess: length mismatch (guess ${guess.length}, truth ${truth.length})`,
    );
  }
  if (guess.length === 0) {
    throw new Error("scoreGuess: empty path");
  }

  let absSum = 0;
  let signedSum = 0;

  for (let i = 0; i < guess.length; i += 1) {
    const delta = guess[i] - truth[i];
    absSum += Math.abs(delta);
    signedSum += delta;
  }

  const meanAbsError = absSum / guess.length;
  const meanSignedError = signedSum / guess.length;

  return {
    meanAbsError,
    meanSignedError,
    score: Math.round(100 * Math.exp(-4 * meanAbsError)),
  };
}
