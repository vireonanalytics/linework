import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  bucketExpiry,
  bucketKey,
  clientAddressFrom,
  verdictFor,
} from "./rate-limit.ts";

test("the bucket key is stable inside a window and changes across one", () => {
  const t = 1_800_000_000_000;
  assert.equal(bucketKey("abc", t), bucketKey("abc", t + RATE_LIMIT_WINDOW_MS - 1));
  assert.notEqual(bucketKey("abc", t), bucketKey("abc", t + RATE_LIMIT_WINDOW_MS));
});

test("different clients never share a bucket", () => {
  const t = 1_800_000_000_000;
  assert.notEqual(bucketKey("abc", t), bucketKey("abd", t));
});

test("expiry lands at the end of the current window", () => {
  const t = 1_800_000_030_000;
  const expiry = bucketExpiry(t).getTime();
  assert.ok(expiry > t);
  assert.ok(expiry - t <= RATE_LIMIT_WINDOW_MS);
  assert.equal(expiry % RATE_LIMIT_WINDOW_MS, 0);
});

test("requests are allowed up to the limit and refused after", () => {
  const t = 1_800_000_000_000;
  assert.ok(verdictFor(1, t).allowed);
  assert.ok(verdictFor(RATE_LIMIT_MAX, t).allowed);
  assert.ok(!verdictFor(RATE_LIMIT_MAX + 1, t).allowed);
});

test("remaining counts down and never goes negative", () => {
  const t = 1_800_000_000_000;
  assert.equal(verdictFor(1, t).remaining, RATE_LIMIT_MAX - 1);
  assert.equal(verdictFor(RATE_LIMIT_MAX, t).remaining, 0);
  assert.equal(verdictFor(RATE_LIMIT_MAX + 99, t).remaining, 0);
});

test("retry-after is always a positive whole number of seconds", () => {
  for (const offset of [0, 1, 30_000, 59_999]) {
    const { retryAfterSeconds } = verdictFor(99, 1_800_000_000_000 + offset);
    assert.ok(Number.isInteger(retryAfterSeconds));
    assert.ok(retryAfterSeconds >= 1);
  }
});

test("the client address comes from the leftmost forwarded entry", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
  });
  assert.equal(clientAddressFrom(headers), "203.0.113.7");
});

test("falls back to x-real-ip, then to nothing", () => {
  assert.equal(
    clientAddressFrom(new Headers({ "x-real-ip": "203.0.113.9" })),
    "203.0.113.9",
  );
  assert.equal(clientAddressFrom(new Headers()), null);
});
