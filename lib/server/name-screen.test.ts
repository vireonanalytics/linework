import assert from "node:assert/strict";
import { test } from "node:test";
import { screenDisplayName } from "./name-screen.ts";

test("ordinary names pass", () => {
  for (const name of [
    "Maria",
    "Jean-Paul",
    "Mary Jane",
    "James B.",
    "李雷",
    "Priya S",
    "O'Brien",
    "Ana-Sofía",
  ]) {
    assert.equal(screenDisplayName(name), null, `${name} should be allowed`);
  }
});

/*
 * The Scunthorpe problem. These are the reason matching is on whole words
 * rather than substrings, and they are the cases most likely to break real
 * signups, so they get their own test.
 */
test("real words and place names containing a banned substring still pass", () => {
  for (const name of [
    "Scunthorpe",
    "Penistone",
    "Dickens",
    "Assessor Sam",
    "Class of 99",
    "Cockburn",
    "Shitake Sam", // not on the list, but adjacent - must not be caught by accident
    "Analyst Ana",
    "Grape Sussex",
  ]) {
    assert.equal(screenDisplayName(name), null, `${name} should be allowed`);
  }
});

test("slurs are caught as whole words", () => {
  assert.equal(screenDisplayName("nigger"), "blocked-word");
  assert.equal(screenDisplayName("big faggot energy"), "blocked-word");
});

test("leetspeak substitutions are normalised before matching", () => {
  assert.equal(screenDisplayName("n1gg3r"), "blocked-word");
  assert.equal(screenDisplayName("f4gg0t"), "blocked-word");
});

test("separators cannot be used to smuggle a slur through", () => {
  assert.equal(screenDisplayName("n.i.g.g.e.r"), "blocked-word");
  assert.equal(screenDisplayName("n i g g e r"), "blocked-word");
});

test("accents are stripped before matching", () => {
  assert.equal(screenDisplayName("nïgger"), "blocked-word");
});

test("staff impersonation is caught", () => {
  assert.equal(screenDisplayName("admin"), "impersonation");
  assert.equal(screenDisplayName("Linework Support"), "impersonation");
  assert.equal(screenDisplayName("moderator"), "impersonation");
});

test("a name that merely mentions the product is fine", () => {
  // "linework" alone is impersonation; using it in a sentence is not.
  assert.equal(screenDisplayName("I love linework drawing"), null);
});

test("a name with no letters or digits is rejected", () => {
  assert.equal(screenDisplayName("!!!"), "not-a-name");
  assert.equal(screenDisplayName("---"), "not-a-name");
});
