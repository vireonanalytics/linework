import assert from "node:assert/strict";
import { test } from "node:test";
import { shortJustification } from "./justification.ts";

test("extracts the text after the perception-gap marker", () => {
  const note =
    "Some long setup text about interpolation and anchors that goes on for a " +
    "while and would be tedious to read every time. " +
    "**The perception-gap claim behind this dataset:** Pew found 56% of " +
    "Americans believe gun crime rose. https://example.com";
  const result = shortJustification(note);
  assert.ok(result.startsWith("Pew found 56%"));
  assert.ok(!result.includes("tedious to read"));
});

test("falls back to a truncated version of the whole note when there is no marker", () => {
  const note = "x".repeat(500);
  const result = shortJustification(note);
  assert.ok(result.length <= 221); // MAX_LENGTH + ellipsis
  assert.ok(result.endsWith("…"));
});

test("short notes are returned whole, no ellipsis added", () => {
  const note = "A short note.";
  assert.equal(shortJustification(note), "A short note.");
});

test("null methodology note gets an explicit placeholder, not a crash", () => {
  assert.equal(shortJustification(null), "No methodology note on file.");
});

test("truncation cuts at a word boundary, not mid-word", () => {
  const note = "**The perception-gap claim behind this dataset:** " + "word ".repeat(60);
  const result = shortJustification(note);
  assert.ok(!result.endsWith("wor…"), "should not cut mid-word");
});
