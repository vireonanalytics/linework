import assert from "node:assert/strict";
import { test } from "node:test";
import { PATH_POINTS } from "../drawing/resample.ts";
import { teenBirthRate } from "../datasets/teen-birth-rate.ts";
import { scoreGuess, truthPathNormalized } from "./score.ts";

const truth = truthPathNormalized(teenBirthRate, PATH_POINTS);

test("the resampled truth has one point per stored path position", () => {
  assert.equal(truth.length, PATH_POINTS);
  assert.ok(truth.every((unit) => unit >= 0 && unit <= 1));
});

test("the resampled truth starts and ends on the real values", () => {
  const [min, max] = teenBirthRate.yDomain;
  const span = max - min;
  const first = teenBirthRate.yValues[teenBirthRate.revealFromIndex];
  const last = teenBirthRate.yValues[teenBirthRate.yValues.length - 1];

  assert.ok(Math.abs(truth[0] - (first - min) / span) < 1e-12);
  assert.ok(
    Math.abs(truth[PATH_POINTS - 1] - (last - min) / span) < 1e-12,
  );
});

test("tracing the truth exactly scores 100 with no error", () => {
  const result = scoreGuess([...truth], truth);
  assert.equal(result.score, 100);
  assert.equal(result.meanAbsError, 0);
  assert.equal(result.meanSignedError, 0);
});

test("a flat line from the last known value scores low and reads too high", () => {
  // The rate roughly halves after 2007, so predicting no change is the classic
  // wrong answer, and it is wrong in a specific direction.
  const flat = new Array(PATH_POINTS).fill(truth[0]);
  const result = scoreGuess(flat, truth);

  assert.ok(result.score < 50, `expected a low score, got ${result.score}`);
  assert.ok(
    result.meanSignedError > 0.1,
    `expected a clearly positive signed error, got ${result.meanSignedError}`,
  );
});

test("signed error carries direction where absolute error cannot", () => {
  const tooHigh = truth.map((unit) => Math.min(1, unit + 0.1));
  const tooLow = truth.map((unit) => Math.max(0, unit - 0.1));

  const high = scoreGuess(tooHigh, truth);
  const low = scoreGuess(tooLow, truth);

  assert.ok(high.meanSignedError > 0);
  assert.ok(low.meanSignedError < 0);
  // The whole point: absolute error cannot tell these two apart.
  assert.ok(Math.abs(high.meanAbsError - low.meanAbsError) < 1e-9);
  assert.equal(high.score, low.score);
});

test("score falls monotonically as error grows", () => {
  let previous = 101;
  for (const offset of [0, 0.05, 0.1, 0.2, 0.4]) {
    const guess = truth.map((unit) => Math.min(1, unit + offset));
    const { score } = scoreGuess(guess, truth);
    assert.ok(score < previous, `offset ${offset} scored ${score}`);
    previous = score;
  }
});

test("rejects mismatched lengths rather than scoring garbage", () => {
  assert.throws(() => scoreGuess([0.1, 0.2], truth), /length mismatch/);
  assert.throws(() => scoreGuess([], []), /empty path/);
});
