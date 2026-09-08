import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_STREAK,
  FREEZE_EARN_INTERVAL,
  MAX_BANKED_FREEZES,
  recordQualifyingDay,
  type StreakState,
} from "./compute.ts";

test("the very first qualifying day starts a streak at 1", () => {
  const { next, event } = recordQualifyingDay(EMPTY_STREAK, "2026-01-01");
  assert.equal(next.currentStreak, 1);
  assert.equal(next.longestStreak, 1);
  assert.equal(next.lastActiveDate, "2026-01-01");
  assert.equal(event, "started");
});

test("the next consecutive day continues the streak", () => {
  const day1 = recordQualifyingDay(EMPTY_STREAK, "2026-01-01").next;
  const day2 = recordQualifyingDay(day1, "2026-01-02");
  assert.equal(day2.next.currentStreak, 2);
  assert.equal(day2.event, "continued");
});

test("calling it twice on the same day is a no-op, not a double increment", () => {
  const day1 = recordQualifyingDay(EMPTY_STREAK, "2026-01-01").next;
  const again = recordQualifyingDay(day1, "2026-01-01");
  assert.equal(again.next.currentStreak, 1);
  assert.equal(again.event, "already-counted");
  assert.deepEqual(again.next, day1);
});

test("missing exactly one day with no freeze resets to 1, not 0", () => {
  let state: StreakState = EMPTY_STREAK;
  state = recordQualifyingDay(state, "2026-01-01").next;
  state = recordQualifyingDay(state, "2026-01-02").next;
  // 2026-01-03 skipped entirely.
  const result = recordQualifyingDay(state, "2026-01-04");
  assert.equal(result.next.currentStreak, 1);
  assert.equal(result.event, "reset");
});

test("longestStreak survives a reset of currentStreak", () => {
  let state: StreakState = EMPTY_STREAK;
  for (const day of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
    state = recordQualifyingDay(state, day).next;
  }
  assert.equal(state.currentStreak, 3);
  const afterGap = recordQualifyingDay(state, "2026-01-10").next;
  assert.equal(afterGap.currentStreak, 1);
  assert.equal(afterGap.longestStreak, 3);
});

test("a banked freeze covers exactly one missed day", () => {
  const withFreeze: StreakState = { ...EMPTY_STREAK, freezesAvailable: 1 };
  const day1 = recordQualifyingDay(withFreeze, "2026-01-01").next;
  const day2 = recordQualifyingDay(day1, "2026-01-02").next;
  // 2026-01-03 skipped - one day gap, freeze should cover it.
  const result = recordQualifyingDay(day2, "2026-01-04");
  assert.equal(result.event, "freeze-used");
  assert.equal(result.next.currentStreak, 3);
  assert.equal(result.next.freezesAvailable, 0, "the freeze should be consumed");
});

test("a freeze does not cover a two-day gap", () => {
  const withFreeze: StreakState = {
    currentStreak: 5,
    longestStreak: 5,
    lastActiveDate: "2026-01-01",
    freezesAvailable: 1,
  };
  // 01-02 and 01-03 both skipped: a two-day gap, one freeze is not enough.
  const result = recordQualifyingDay(withFreeze, "2026-01-04");
  assert.equal(result.event, "reset");
  assert.equal(result.next.currentStreak, 1);
  // The freeze was not consumed, since it didn't apply.
  assert.equal(result.next.freezesAvailable, 1);
});

test("with zero freezes banked, a one-day gap still resets", () => {
  const noFreeze: StreakState = {
    currentStreak: 5,
    longestStreak: 5,
    lastActiveDate: "2026-01-01",
    freezesAvailable: 0,
  };
  const result = recordQualifyingDay(noFreeze, "2026-01-03");
  assert.equal(result.event, "reset");
  assert.equal(result.next.currentStreak, 1);
});

test(`a freeze is earned every ${FREEZE_EARN_INTERVAL}-day milestone`, () => {
  let state: StreakState = EMPTY_STREAK;
  let date = new Date("2026-01-01T00:00:00Z");
  let lastOutcome;
  for (let i = 0; i < FREEZE_EARN_INTERVAL; i += 1) {
    const iso = date.toISOString().slice(0, 10);
    lastOutcome = recordQualifyingDay(state, iso);
    state = lastOutcome.next;
    date = new Date(date.getTime() + 86_400_000);
  }
  assert.equal(state.currentStreak, FREEZE_EARN_INTERVAL);
  assert.equal(lastOutcome!.freezeEarned, true);
  assert.equal(state.freezesAvailable, 1);
});

test("banked freezes never exceed the cap", () => {
  let state: StreakState = { ...EMPTY_STREAK, freezesAvailable: MAX_BANKED_FREEZES };
  let date = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < FREEZE_EARN_INTERVAL; i += 1) {
    const iso = date.toISOString().slice(0, 10);
    state = recordQualifyingDay(state, iso).next;
    date = new Date(date.getTime() + 86_400_000);
  }
  assert.ok(state.freezesAvailable <= MAX_BANKED_FREEZES);
});

test("rejects a non-ISO date rather than silently misparsing", () => {
  assert.throws(() => recordQualifyingDay(EMPTY_STREAK, "01/01/2026"));
  assert.throws(() => recordQualifyingDay(EMPTY_STREAK, "Jan 1 2026"));
});

test("rejects a date earlier than lastActiveDate, rather than un-resetting a streak", () => {
  const state: StreakState = { ...EMPTY_STREAK, lastActiveDate: "2026-01-05" };
  assert.throws(() => recordQualifyingDay(state, "2026-01-01"));
});

test("a date exactly equal to lastActiveDate is the already-counted case, not an error", () => {
  const state: StreakState = { ...EMPTY_STREAK, lastActiveDate: "2026-01-05" };
  const result = recordQualifyingDay(state, "2026-01-05");
  assert.equal(result.event, "already-counted");
});
