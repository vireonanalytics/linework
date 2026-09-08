import assert from "node:assert/strict";
import { test } from "node:test";
import { compareToCrowd, describeComparison } from "./compare.ts";

const N = 40;
const flat = (value: number) => new Array(N).fill(value);

test("a guess matching the median, on target, reads as within-crowd and on-target", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };
  const comparison = compareToCrowd(flat(500), truth, percentiles, 200);

  assert.equal(comparison.overallPosition, "within-crowd");
  assert.equal(comparison.playerBias, "on-target");
  assert.equal(comparison.crowdBias, "on-target");
  assert.equal(comparison.agreesWithCrowd, true);
});

test("a guess consistently above p75 reads as above-crowd", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };
  const comparison = compareToCrowd(flat(700), truth, percentiles, 200);

  assert.equal(comparison.overallPosition, "above-crowd");
  assert.equal(comparison.fractionAbove, 1);
  assert.equal(comparison.fractionBelow, 0);
});

test("a guess consistently below p25 reads as below-crowd", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };
  const comparison = compareToCrowd(flat(300), truth, percentiles, 200);

  assert.equal(comparison.overallPosition, "below-crowd");
  assert.equal(comparison.fractionBelow, 1);
});

test("bias direction matches the sign of the mean delta against truth", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(600), p75: flat(650) };

  // The player overestimates by exactly as much as the crowd's median does.
  const comparison = compareToCrowd(flat(600), truth, percentiles, 200);
  assert.equal(comparison.playerBias, "too-high");
  assert.equal(comparison.crowdBias, "too-high");
  assert.equal(comparison.agreesWithCrowd, true);
});

test("agreesWithCrowd is false when the player is wrong the other way", () => {
  const truth = flat(500);
  // Crowd overestimates (median above truth); player underestimates.
  const percentiles = { p25: flat(550), p50: flat(600), p75: flat(650) };
  const comparison = compareToCrowd(flat(400), truth, percentiles, 200);

  assert.equal(comparison.playerBias, "too-low");
  assert.equal(comparison.crowdBias, "too-high");
  assert.equal(comparison.agreesWithCrowd, false);
});

test("small deltas within the epsilon read as on-target, not a direction", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(490), p50: flat(505), p75: flat(515) };
  // 5 units off - inside BIAS_EPSILON, should not register as a lean.
  const comparison = compareToCrowd(flat(504), truth, percentiles, 200);

  assert.equal(comparison.playerBias, "on-target");
  assert.equal(comparison.crowdBias, "on-target");
});

test("fractions sum to 1 and reflect a genuinely mixed guess", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };

  // Half the points above p75, half within band.
  const mixed = [...flat(700).slice(0, 20), ...flat(500).slice(0, 20)];
  const comparison = compareToCrowd(mixed, truth, percentiles, 200);

  assert.equal(comparison.fractionAbove, 0.5);
  assert.equal(comparison.fractionWithin, 0.5);
  assert.equal(comparison.fractionBelow, 0);
  assert.ok(
    Math.abs(
      comparison.fractionAbove + comparison.fractionBelow + comparison.fractionWithin - 1,
    ) < 1e-9,
  );
});

test("rejects mismatched-length inputs rather than silently misreading", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };
  assert.throws(() => compareToCrowd([1, 2, 3], truth, percentiles, 200));
});

test("describeComparison always returns two non-empty sentences", () => {
  const truth = flat(500);
  const percentiles = { p25: flat(450), p50: flat(500), p75: flat(550) };

  for (const guess of [flat(300), flat(500), flat(700)]) {
    const { position, bias } = describeComparison(
      compareToCrowd(guess, truth, percentiles, 200),
    );
    assert.ok(position.length > 0);
    assert.ok(bias.length > 0);
  }
});

test("describeComparison names the crowd's actual direction, not a generic line", () => {
  const truth = flat(500);
  // Crowd clearly underestimated the fall (median far above truth in a
  // falling series context is analogous to "too high" bias here).
  const percentiles = { p25: flat(580), p50: flat(620), p75: flat(660) };
  const comparison = compareToCrowd(flat(600), truth, percentiles, 500);
  const { bias } = describeComparison(comparison);

  assert.match(bias, /most people/i);
  assert.match(bias, /overestimated/i);
});
