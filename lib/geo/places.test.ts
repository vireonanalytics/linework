import assert from "node:assert/strict";
import { test } from "node:test";
import rawPlaces from "./us-places.json" with { type: "json" };
import { isValidPlace, isValidStateName, searchPlaces } from "./places.ts";

test("a real city/state pair is valid", () => {
  assert.ok(isValidPlace("Chicago", "Illinois"));
  assert.ok(isValidPlace("New York", "New York"));
});

test("a fabricated city is rejected, even with a real state", () => {
  assert.ok(!isValidPlace("Nowhereville", "Texas"));
});

test("a real city paired with the wrong state is rejected", () => {
  // Chicago is in Illinois, not Texas - the pair has to match, not just
  // each field independently.
  assert.ok(!isValidPlace("Chicago", "Texas"));
});

test("matching is case-sensitive to the bundled list, by design", () => {
  // The signup form is expected to submit exactly what the autocomplete
  // offered, not user-typed casing. A case-insensitive match would let
  // free text slip through disguised as a selection.
  assert.ok(!isValidPlace("chicago", "illinois"));
});

test("every state in the bundled place list is a real state name", () => {
  // Data integrity, not behaviour: if the fetched place list ever had a
  // typo'd or non-standard state name, isValidPlace would silently treat it
  // as legitimate for that one city. Catch it here instead.
  const badRows = (rawPlaces as { city: string; state: string }[]).filter(
    (row) => !isValidStateName(row.state),
  );
  assert.deepEqual(badRows, []);
});

test("the bundled place list has no duplicate city+state pairs", () => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of rawPlaces as { city: string; state: string }[]) {
    const key = `${row.city}, ${row.state}`;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  assert.deepEqual(duplicates, []);
});

test("search matches on a case-insensitive city prefix", () => {
  const results = searchPlaces("chic");
  assert.ok(results.some((p) => p.city === "Chicago"));
});

test("search is capped at the requested limit", () => {
  const results = searchPlaces("san", 3);
  assert.equal(results.length, 3);
});

test("an empty query returns nothing rather than the whole list", () => {
  assert.deepEqual(searchPlaces(""), []);
  assert.deepEqual(searchPlaces("   "), []);
});

test("state names in the bundled dataset are recognised as valid", () => {
  assert.ok(isValidStateName("Illinois"));
  assert.ok(isValidStateName("District of Columbia"));
  assert.ok(!isValidStateName("Not A State"));
  assert.ok(!isValidStateName("illinois"));
});
