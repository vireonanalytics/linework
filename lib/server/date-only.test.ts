import test from "node:test";
import assert from "node:assert/strict";
import { toDateOnly } from "./db.ts";

/**
 * Regression tests for the streak-reset bug (2026-08-28).
 *
 * postgres.js hydrates a DATE column into a JS Date. The old code did
 * String(value).slice(0, 10), which produces "Thu Aug 27" - so the
 * "already counted today" check never matched and the value fed to the streak
 * calculator was an unparseable date that read as a huge gap, resetting the
 * streak on every guess.
 */
test("a Date from the driver becomes a YYYY-MM-DD string", () => {
  assert.equal(toDateOnly(new Date("2026-08-28T00:00:00.000Z")), "2026-08-28");
  assert.equal(toDateOnly(new Date("2026-01-05T23:59:59.000Z")), "2026-01-05");
});

test("the old stringification is exactly what this prevents", () => {
  const d = new Date("2026-08-28T00:00:00.000Z");
  assert.notEqual(String(d).slice(0, 10), "2026-08-28");
  assert.equal(toDateOnly(d), "2026-08-28");
});

test("UTC is used, not the server's local timezone", () => {
  // Midnight UTC is the previous evening in the Americas. The date must not
  // shift with wherever the server happens to run.
  assert.equal(toDateOnly(new Date("2026-08-28T00:30:00.000Z")), "2026-08-28");
  assert.equal(toDateOnly(new Date("2026-08-28T23:30:00.000Z")), "2026-08-28");
});

test("text input passes through, and junk does not", () => {
  assert.equal(toDateOnly("2026-08-28"), "2026-08-28");
  assert.equal(toDateOnly("2026-08-28T04:00:00Z"), "2026-08-28");
  assert.equal(toDateOnly("Thu Aug 27 2026"), null);
  assert.equal(toDateOnly(null), null);
  assert.equal(toDateOnly(undefined), null);
});
