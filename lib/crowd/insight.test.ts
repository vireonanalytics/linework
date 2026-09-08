import assert from "node:assert/strict";
import { test } from "node:test";
import { inferBiasStatement } from "./insight.ts";

test("zero clean responses: says so, does not divide by zero", () => {
  assert.equal(
    inferBiasStatement(null, 0),
    "No clean responses yet - nothing to infer.",
  );
});

test("null avgSignedError with n>0 (should not happen, but stays safe)", () => {
  assert.equal(
    inferBiasStatement(null, 5),
    "No clean responses yet - nothing to infer.",
  );
});

test("within epsilon of zero reads as accurate, not a direction", () => {
  const result = inferBiasStatement(0.005, 100);
  assert.match(result, /accurate/);
  assert.match(result, /n=100/);
});

test("positive avgSignedError beyond epsilon reads as overestimated", () => {
  const result = inferBiasStatement(0.12, 250);
  assert.match(result, /overestimated/);
  assert.match(result, /12\.0 points/);
  assert.match(result, /n=250/);
});

test("negative avgSignedError beyond epsilon reads as underestimated", () => {
  const result = inferBiasStatement(-0.08, 40);
  assert.match(result, /underestimated/);
  assert.match(result, /8\.0 points/);
  assert.match(result, /n=40/);
});

test("exactly at the epsilon boundary counts as accurate, not a direction", () => {
  const result = inferBiasStatement(0.01, 10);
  assert.match(result, /accurate/);
});

test("just past the epsilon boundary counts as a direction", () => {
  const result = inferBiasStatement(0.011, 10);
  assert.match(result, /overestimated/);
});
