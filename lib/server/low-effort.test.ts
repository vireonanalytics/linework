import assert from "node:assert/strict";
import { test } from "node:test";
import { lowEffortReason, lowEffortNotice } from "./low-effort.ts";
import { PATH_MAX, PATH_POINTS } from "../drawing/resample.ts";

const fill = (value: number) => new Array<number>(PATH_POINTS).fill(value);

test("a line pinned to the top edge is caught", () => {
  assert.equal(lowEffortReason(fill(PATH_MAX)), "pinned-to-edge");
});

test("a line pinned to the bottom edge is caught", () => {
  assert.equal(lowEffortReason(fill(0)), "pinned-to-edge");
});

test("a zigzag between the extremes is caught", () => {
  const path = Array.from({ length: PATH_POINTS }, (_, i) =>
    i % 2 === 0 ? 0 : PATH_MAX,
  );
  assert.notEqual(lowEffortReason(path), null);
});

test("a scribble with many reversals is caught", () => {
  // Small oscillation around the middle - not a full-range sweep, but far
  // more direction changes than a real prediction has.
  const path = Array.from({ length: PATH_POINTS }, (_, i) =>
    500 + (i % 2 === 0 ? -60 : 60),
  );
  assert.equal(lowEffortReason(path), "scribble");
});

// --- the important half: things that must NOT be flagged -------------------

test("a flat line in the MIDDLE is not junk - it is a real prediction", () => {
  // "I think it stayed about the same" is one of the most common honest
  // answers there is. Only the extreme edges indicate a dragged finger.
  assert.equal(lowEffortReason(fill(500)), null);
});

test("a confidently wrong straight line is not junk", () => {
  // Rising hard when the truth fell is exactly the misperception this
  // project exists to measure. Flagging it would destroy the signal.
  const path = Array.from({ length: PATH_POINTS }, (_, i) =>
    Math.round((i / (PATH_POINTS - 1)) * PATH_MAX),
  );
  assert.equal(lowEffortReason(path), null);
});

test("a steep single drop is not junk", () => {
  const path = Array.from({ length: PATH_POINTS }, (_, i) =>
    i < 5 ? 900 : 120,
  );
  assert.equal(lowEffortReason(path), null);
});

test("a wavy but plausible curve is not junk", () => {
  const path = Array.from({ length: PATH_POINTS }, (_, i) =>
    Math.round(500 + Math.sin(i / 6) * 220),
  );
  assert.equal(lowEffortReason(path), null);
});

test("a line that merely touches an edge briefly is not junk", () => {
  const path = Array.from({ length: PATH_POINTS }, (_, i) => (i < 3 ? 0 : 400));
  assert.equal(lowEffortReason(path), null);
});

test("too short a path is ignored rather than guessed at", () => {
  assert.equal(lowEffortReason([0, 0, 0]), null);
});

test("the notice explains why the data matters and does not accuse", () => {
  const notice = lowEffortNotice("scribble");
  assert.match(notice, /research/i);
  // Must make clear that being WRONG is fine - the whole dataset depends on
  // people feeling free to be wrong.
  assert.match(notice, /wrong is genuinely fine/i);
});
