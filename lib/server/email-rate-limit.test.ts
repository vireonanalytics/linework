import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_RATE_MAX_PER_ADDRESS,
  EMAIL_RATE_MAX_PER_CLIENT,
  EMAIL_RATE_WINDOW_MS,
} from "./email-rate-limit.ts";

/**
 * These assert a RELATIONSHIP, not magic numbers, so the limits can be tuned
 * without churning the test - but the reasoning behind them cannot be quietly
 * inverted.
 */

test("a client is allowed far more than a single address", () => {
  /*
   * The bug this locks out: both limits were 5, which meant one shared IP -
   * an office, a campus, a carrier's CGNAT - got five password resets per
   * hour for everyone behind it. A real user could not recover their account
   * because a stranger on the same network already had.
   *
   * A client is not a person. An address is.
   */
  assert.ok(
    EMAIL_RATE_MAX_PER_CLIENT >= EMAIL_RATE_MAX_PER_ADDRESS * 3,
    "the per-client ceiling must be well above the per-address one, or " +
      "shared connections lock out legitimate users",
  );
});

test("the per-address limit stays tight enough to stop a mail flood", () => {
  // This is the limit that protects a third party who never asked to be
  // involved, so it must not drift upward.
  assert.ok(EMAIL_RATE_MAX_PER_ADDRESS <= 10);
  assert.ok(EMAIL_RATE_MAX_PER_ADDRESS >= 3, "too tight to be usable");
});

test("the window is an hour, so a stated retry time stays meaningful", () => {
  assert.equal(EMAIL_RATE_WINDOW_MS, 60 * 60 * 1000);
});
