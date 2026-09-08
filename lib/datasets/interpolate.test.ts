import assert from "node:assert/strict";
import { test } from "node:test";
import { interpolateAnnualSeries } from "./interpolate.ts";

test("produces one value per year across the full range, inclusive", () => {
  const { xValues, yValues } = interpolateAnnualSeries([
    { year: 2000, value: 0 },
    { year: 2010, value: 100 },
  ]);
  assert.equal(xValues.length, 11);
  assert.equal(yValues.length, 11);
  assert.equal(xValues[0], "2000");
  assert.equal(xValues[xValues.length - 1], "2010");
});

test("endpoints are exact", () => {
  const { yValues } = interpolateAnnualSeries([
    { year: 2000, value: 61.8 },
    { year: 2023, value: 13.2 },
  ]);
  assert.equal(yValues[0], 61.8);
  assert.equal(yValues[yValues.length - 1], 13.2);
});

test("a two-anchor series is exactly linear in between", () => {
  const { yValues } = interpolateAnnualSeries([
    { year: 2000, value: 0 },
    { year: 2010, value: 100 },
  ]);
  assert.equal(yValues[5], 50); // year 2005, exact midpoint
});

test("intermediate anchors are hit exactly, not just approximated", () => {
  const { xValues, yValues } = interpolateAnnualSeries([
    { year: 2000, value: 0 },
    { year: 2010, value: 100 },
    { year: 2020, value: 20 },
  ]);
  const index2010 = xValues.indexOf("2010");
  assert.equal(yValues[index2010], 100);
});

test("interpolation reverses direction correctly at an inflection anchor", () => {
  const { yValues } = interpolateAnnualSeries([
    { year: 2000, value: 0 },
    { year: 2010, value: 100 },
    { year: 2020, value: 0 },
  ]);
  // Rising into 2010, falling after it.
  assert.ok(yValues[3] < yValues[10]);
  assert.ok(yValues[15] < yValues[10]);
});

test("rejects fewer than two anchors", () => {
  assert.throws(() => interpolateAnnualSeries([{ year: 2000, value: 0 }]));
  assert.throws(() => interpolateAnnualSeries([]));
});

test("rejects anchors that are not strictly increasing by year", () => {
  assert.throws(() =>
    interpolateAnnualSeries([
      { year: 2010, value: 0 },
      { year: 2000, value: 1 },
    ]),
  );
  assert.throws(() =>
    interpolateAnnualSeries([
      { year: 2000, value: 0 },
      { year: 2000, value: 1 },
    ]),
  );
});
