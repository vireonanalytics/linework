import assert from "node:assert/strict";
import { test } from "node:test";
import { PATH_POINTS } from "../drawing/resample.ts";
import { truthPathNormalized } from "../scoring/score.ts";
import { teenBirthRate } from "../datasets/teen-birth-rate.ts";
import { syntheticCrowd } from "./synthetic.ts";

const truth = truthPathNormalized(teenBirthRate, PATH_POINTS);
const crowd = syntheticCrowd({ truth, count: 400 });

test("produces the requested number of paths at the stored resolution", () => {
  assert.equal(crowd.length, 400);
  assert.ok(crowd.every((path) => path.length === PATH_POINTS));
});

test("every value is a real number inside the drawable range", () => {
  for (const path of crowd) {
    for (const value of path) {
      assert.ok(Number.isFinite(value), `${value} is not finite`);
      assert.ok(value >= 0 && value <= 1, `${value} is outside 0..1`);
    }
  }
});

test("is deterministic, so a screenshot is reproducible", () => {
  assert.deepEqual(
    syntheticCrowd({ truth, count: 20, seed: 7 }),
    syntheticCrowd({ truth, count: 20, seed: 7 }),
  );
  assert.notDeepEqual(
    syntheticCrowd({ truth, count: 20, seed: 7 }),
    syntheticCrowd({ truth, count: 20, seed: 8 }),
  );
});

test("paths start near the last known value, as a real guess would", () => {
  const starts = crowd.map((path) => path[0]);
  for (const start of starts) {
    assert.ok(
      Math.abs(start - truth[0]) < 0.08,
      `a guess starting at ${start} ignores the anchor at ${truth[0]}`,
    );
  }
});

test("the crowd undershoots the fall, which is the point of the preview", () => {
  // A uniformly random crowd would render as noise and would tell us nothing
  // about whether the ink density reads. The bias has to actually be there.
  const endings = crowd.map((path) => path[path.length - 1]);
  const tooHigh = endings.filter((value) => value > truth[truth.length - 1]);

  assert.ok(
    tooHigh.length / endings.length > 0.75,
    `only ${tooHigh.length}/${endings.length} ended above the truth`,
  );
});

test("the crowd still spreads, rather than collapsing onto one line", () => {
  const endings = crowd.map((path) => path[path.length - 1]);
  const mean = endings.reduce((a, b) => a + b, 0) / endings.length;
  const sd = Math.sqrt(
    endings.reduce((sum, v) => sum + (v - mean) ** 2, 0) / endings.length,
  );

  assert.ok(sd > 0.03, `spread of ${sd.toFixed(4)} is too tight to look human`);
  assert.ok(sd < 0.30, `spread of ${sd.toFixed(4)} is just noise`);
});

test("no two paths are identical", () => {
  const seen = new Set(crowd.map((path) => path.join(",")));
  assert.equal(seen.size, crowd.length);
});
