import assert from "node:assert/strict";
import { test } from "node:test";
import { todayUtc } from "./select.ts";

test("todayUtc returns an ISO date string", () => {
  const result = todayUtc(new Date("2026-06-15T23:59:00Z"));
  assert.equal(result, "2026-06-15");
});

test("todayUtc is timezone-independent - UTC, not local wall clock", () => {
  // 11pm UTC and 1am UTC the next day must not collapse to the same date
  // just because a local clock reads the "same evening" somewhere.
  const late = todayUtc(new Date("2026-06-15T23:30:00Z"));
  const early = todayUtc(new Date("2026-06-16T00:30:00Z"));
  assert.notEqual(late, early);
});
