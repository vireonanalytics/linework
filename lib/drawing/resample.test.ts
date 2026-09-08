import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PATH_MAX,
  PATH_POINTS,
  dequantize,
  hasZeroVariance,
  quantize,
  resampleStroke,
  strokeSpanFraction,
  type StrokePoint,
} from "./resample.ts";

/** A straight line from (0, 0) to (100, 100), sampled at `count` points. */
function diagonal(count: number): StrokePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: t * 100, y: t * 100 };
  });
}

test("always returns exactly PATH_POINTS points", () => {
  for (const rawCount of [2, 3, 7, 41, 200, 5000]) {
    const out = resampleStroke(diagonal(rawCount), 0, 100);
    assert.equal(out.length, PATH_POINTS, `raw count ${rawCount}`);
  }
});

test("a straight stroke resamples to a straight line", () => {
  // Point count must not change the result for a linear stroke.
  const coarse = resampleStroke(diagonal(2), 0, 100);
  const fine = resampleStroke(diagonal(997), 0, 100);

  for (let i = 0; i < PATH_POINTS; i += 1) {
    const expected = (i / (PATH_POINTS - 1)) * 100;
    assert.ok(Math.abs(coarse[i] - expected) < 1e-9, `coarse ${i}`);
    assert.ok(Math.abs(fine[i] - expected) < 0.2, `fine ${i}`);
  }
});

test("holds the final value forward when the stroke stops short", () => {
  const stroke: StrokePoint[] = [
    { x: 0, y: 10 },
    { x: 50, y: 40 },
  ];
  const out = resampleStroke(stroke, 0, 100);

  assert.equal(out.length, PATH_POINTS);
  assert.equal(out[PATH_POINTS - 1], 40);
  // Everything past the end of the stroke is the final value.
  assert.ok(out.slice(20).every((y) => y === 40));
});

test("holds the first value backward when the stroke starts late", () => {
  const stroke: StrokePoint[] = [
    { x: 60, y: 30 },
    { x: 100, y: 70 },
  ];
  const out = resampleStroke(stroke, 0, 100);

  assert.equal(out[0], 30);
  assert.equal(out[PATH_POINTS - 1], 70);
});

test("a single-point stroke degenerates to a flat line", () => {
  const out = resampleStroke([{ x: 20, y: 5 }], 0, 100);
  assert.equal(out.length, PATH_POINTS);
  assert.ok(out.every((y) => y === 5));
});

test("rejects an empty stroke rather than returning nonsense", () => {
  assert.throws(() => resampleStroke([], 0, 100), /empty stroke/);
});

test("span fraction measures coverage of the drawable width", () => {
  assert.equal(strokeSpanFraction(diagonal(10), 0, 100), 1);
  assert.equal(
    strokeSpanFraction(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      0,
      100,
    ),
    0.5,
  );
  // A tap has no span at all.
  assert.equal(strokeSpanFraction([{ x: 10, y: 0 }], 0, 100), 0);
});

test("quantize produces integers inside [0, PATH_MAX] and clamps", () => {
  const out = quantize([0, 0.5, 1, -0.2, 1.7, 0.1234]);
  assert.ok(out.every(Number.isInteger));
  assert.deepEqual(out, [0, 500, 1000, 0, PATH_MAX, 123]);
});

test("quantize then dequantize round-trips within one thousandth", () => {
  const units = [0, 0.001, 0.25, 0.3333, 0.5, 0.9999, 1];
  for (const [i, value] of dequantize(quantize(units)).entries()) {
    assert.ok(Math.abs(value - units[i]) <= 1 / PATH_MAX / 2 + 1e-12);
  }
});

test("zero variance detects a perfectly flat path", () => {
  assert.equal(hasZeroVariance([500, 500, 500]), true);
  assert.equal(hasZeroVariance([500, 500, 501]), false);
  assert.equal(hasZeroVariance([]), true);
});
