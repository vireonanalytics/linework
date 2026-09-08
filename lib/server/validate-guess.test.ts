import assert from "node:assert/strict";
import { test } from "node:test";
import { PATH_POINTS } from "../drawing/resample.ts";
import { parseGuessPayload } from "./validate-guess.ts";

const validPath = Array.from({ length: PATH_POINTS }, (_, i) => 500 - i * 5);

function body(overrides: Record<string, unknown> = {}) {
  return {
    slug: "us-teen-birth-rate",
    path: validPath,
    drawMs: 2400,
    redrawCount: 0,
    viewportWidth: 390,
    ...overrides,
  };
}

test("accepts a well-formed guess", () => {
  const result = parseGuessPayload(body());
  assert.ok(result.ok);
  assert.equal(result.value.slug, "us-teen-birth-rate");
  assert.equal(result.value.path.length, PATH_POINTS);
});

test("a submitted score is ignored, never trusted", () => {
  const result = parseGuessPayload(
    body({ score: 100, meanAbsError: 0, meanSignedError: 0 }),
  );
  assert.ok(result.ok);
  assert.ok(!("score" in result.value));
  assert.ok(!("meanAbsError" in result.value));
});

test("rejects a path of the wrong length", () => {
  for (const length of [0, 1, 39, 41, 400]) {
    const result = parseGuessPayload(
      body({ path: Array.from({ length }, () => 500) }),
    );
    assert.ok(!result.ok, `length ${length} should be rejected`);
  }
});

test("rejects path values outside the quantised range", () => {
  for (const bad of [-1, 1001, 1.5, NaN, Infinity, "500", null]) {
    const path = [...validPath];
    path[7] = bad as number;
    assert.ok(!parseGuessPayload(body({ path })).ok, `${bad} should be rejected`);
  }
});

test("does not coerce strings into numbers", () => {
  assert.ok(!parseGuessPayload(body({ drawMs: "2400" })).ok);
  assert.ok(!parseGuessPayload(body({ viewportWidth: "390" })).ok);
  assert.ok(!parseGuessPayload(body({ redrawCount: "0" })).ok);
});

test("rejects a slug that is not url-safe", () => {
  for (const slug of [
    "",
    "Has Capitals",
    "semi;colon",
    "../../etc/passwd",
    "a'or'1'='1",
    "x".repeat(81),
  ]) {
    assert.ok(!parseGuessPayload(body({ slug })).ok, `${slug} should be rejected`);
  }
});

test("rejects implausible counters", () => {
  assert.ok(!parseGuessPayload(body({ drawMs: -1 })).ok);
  assert.ok(!parseGuessPayload(body({ drawMs: 60 * 60 * 1000 })).ok);
  assert.ok(!parseGuessPayload(body({ redrawCount: -1 })).ok);
  assert.ok(!parseGuessPayload(body({ viewportWidth: 0 })).ok);
  assert.ok(!parseGuessPayload(body({ viewportWidth: 999_999 })).ok);
});

test("rejects anything that is not a JSON object", () => {
  for (const value of [null, undefined, 42, "string", [], true]) {
    assert.ok(!parseGuessPayload(value).ok, `${JSON.stringify(value)} should be rejected`);
  }
});

test("missing fields are rejected rather than defaulted", () => {
  for (const field of ["slug", "path", "drawMs", "redrawCount", "viewportWidth"]) {
    const partial = body();
    delete (partial as Record<string, unknown>)[field];
    assert.ok(!parseGuessPayload(partial).ok, `missing ${field} should be rejected`);
  }
});
