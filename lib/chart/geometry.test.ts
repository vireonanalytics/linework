import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeometry, niceTicks } from "./geometry.ts";
import { teenBirthRate } from "../datasets/teen-birth-rate.ts";

test("ticks are values a person would have chosen", () => {
  // The case that started this: dividing 70 into four equal parts produced
  // 0/18/35/53/70, which reads as machine output because it is.
  assert.deepEqual(niceTicks([0, 70]), [0, 20, 40, 60]);
  assert.deepEqual(niceTicks([0, 100]), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks([0, 10]), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks([0, 1]), [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test("every tick is a clean number, not a float artifact", () => {
  for (const domain of [
    [0, 1],
    [0, 0.5],
    [0, 3],
    [0, 70],
    [10, 60],
  ] as [number, number][]) {
    for (const tick of niceTicks(domain)) {
      assert.equal(
        tick,
        Number(tick.toPrecision(12)),
        `${tick} in ${JSON.stringify(domain)} carries float noise`,
      );
    }
  }
});

test("ticks stay inside the domain", () => {
  for (const domain of [
    [0, 70],
    [10, 60],
    [-20, 20],
    [5, 17],
  ] as [number, number][]) {
    for (const tick of niceTicks(domain)) {
      assert.ok(tick >= domain[0] && tick <= domain[1], `${tick} escaped ${domain}`);
    }
  }
});

test("a degenerate domain does not hang or throw", () => {
  assert.deepEqual(niceTicks([5, 5]), [5]);
  assert.deepEqual(niceTicks([10, 0]), [10]);
});

test("geometry maps the drawable region to the right pixels", () => {
  const geometry = createGeometry(teenBirthRate, { width: 600, height: 400 });

  // The boundary sits where the last known year sits.
  assert.equal(
    geometry.drawStartX,
    geometry.xForIndex(teenBirthRate.revealFromIndex),
  );
  assert.equal(geometry.drawEndX, geometry.plotRight);
  assert.ok(geometry.drawWidth > 0);
});

test("value and pixel conversions round-trip", () => {
  const geometry = createGeometry(teenBirthRate, { width: 600, height: 400 });

  for (const value of [0, 13.2, 41.5, 61.8, 70]) {
    const back = geometry.valueForY(geometry.yForValue(value));
    assert.ok(Math.abs(back - value) < 1e-9, `${value} -> ${back}`);
  }
});

test("the y axis is inverted: a bigger value sits higher up", () => {
  const geometry = createGeometry(teenBirthRate, { width: 600, height: 400 });
  assert.ok(geometry.yForValue(60) < geometry.yForValue(20));
  assert.equal(geometry.yForValue(teenBirthRate.yDomain[1]), geometry.plotTop);
  assert.equal(geometry.yForValue(teenBirthRate.yDomain[0]), geometry.plotBottom);
});
