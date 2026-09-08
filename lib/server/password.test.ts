import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  passwordIssue,
  verifyPassword,
} from "./password.ts";

test("a password verifies against its own hash", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.ok(verifyPassword("correct horse battery staple", hash));
});

test("the wrong password fails verification", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.ok(!verifyPassword("wrong password entirely", hash));
});

test("the stored hash never contains the raw password", () => {
  const hash = hashPassword("hunter2");
  assert.ok(!hash.includes("hunter2"));
});

test("two hashes of the same password are different (random salt)", () => {
  const a = hashPassword("same password");
  const b = hashPassword("same password");
  assert.notEqual(a, b);
  // Both still verify - the salt lives inside each hash string.
  assert.ok(verifyPassword("same password", a));
  assert.ok(verifyPassword("same password", b));
});

test("verification is case-sensitive and exact", () => {
  const hash = hashPassword("CaseSensitive1");
  assert.ok(!verifyPassword("casesensitive1", hash));
  assert.ok(!verifyPassword("CaseSensitive1 ", hash));
});

test("malformed stored hashes fail closed, never throw", () => {
  assert.ok(!verifyPassword("anything", ""));
  assert.ok(!verifyPassword("anything", "not-the-right-format"));
  assert.ok(!verifyPassword("anything", "onlyonepart"));
  assert.ok(!verifyPassword("anything", ":"));
});

test("passwordIssue rejects empty and short passwords", () => {
  assert.equal(passwordIssue(""), "empty");
  assert.equal(passwordIssue("short"), "too-short");
  assert.equal(passwordIssue("x".repeat(MIN_PASSWORD_LENGTH - 1)), "too-short");
});

test("passwordIssue accepts a password at exactly the minimum length", () => {
  assert.equal(passwordIssue("x".repeat(MIN_PASSWORD_LENGTH)), null);
});

test("passwordIssue rejects an absurdly long password", () => {
  assert.equal(passwordIssue("x".repeat(1000)), "too-long");
});
