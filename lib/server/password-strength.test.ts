import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_STRONG_PASSWORD_LENGTH,
  passwordScore,
  passwordStrengthIssue,
} from "./password-strength.ts";

test("a long passphrase of ordinary words is accepted", () => {
  // The NIST-recommended shape. If this ever fails, the rules have drifted
  // back toward punishing memorable passwords.
  assert.equal(passwordStrengthIssue("correct horse battery staple"), null);
  assert.equal(passwordStrengthIssue("plum tractor window rain"), null);
});

test("a short password is rejected however complex", () => {
  // Seven characters: complexity does not buy a pass on length.
  assert.equal(passwordStrengthIssue("aB3$xY7"), "too-short");
});

test("the minimum is enforced exactly at the boundary", () => {
  const justUnder = "a".repeat(MIN_STRONG_PASSWORD_LENGTH - 1);
  assert.equal(passwordStrengthIssue(justUnder), "too-short");
  // At the boundary it passes the LENGTH check and falls through to the
  // repetition check, proving length is not the only thing being tested.
  const atLength = "a".repeat(MIN_STRONG_PASSWORD_LENGTH);
  assert.equal(passwordStrengthIssue(atLength), "too-repetitive");
});

test("common passwords are rejected", () => {
  assert.equal(passwordStrengthIssue("password123"), "too-common");
  assert.equal(passwordStrengthIssue("PASSWORD123"), "too-common");
});

test("a common password with a year appended is still common", () => {
  assert.equal(passwordStrengthIssue("password2026"), "too-common");
  assert.equal(passwordStrengthIssue("letmein1999"), "too-common");
});

test("a repeated short unit is rejected even when long", () => {
  assert.equal(passwordStrengthIssue("abcabcabcabc"), "too-repetitive");
  assert.equal(passwordStrengthIssue("xyxyxyxyxyxyxy"), "too-repetitive");
});

test("keyboard runs are rejected", () => {
  assert.equal(passwordStrengthIssue("qwertyuiop12"), "keyboard-pattern");
});

test("a long alphabetical sequence is rejected", () => {
  assert.equal(passwordStrengthIssue("abcdefghijkl"), "keyboard-pattern");
});

test("a password built from the account's own email is rejected", () => {
  assert.equal(
    passwordStrengthIssue("mariagarcia-plum", { email: "mariagarcia@example.com" }),
    "contains-identity",
  );
});

test("a password built from the display name is rejected", () => {
  assert.equal(
    passwordStrengthIssue("tractorMariaLopez", { displayName: "Maria Lopez" }),
    null,
    "a name with a space should not match as one token",
  );
  assert.equal(
    passwordStrengthIssue("plumMarialopez99", { displayName: "marialopez" }),
    "contains-identity",
  );
});

test("a short email local part does not trigger the identity rule", () => {
  // Guarding against a two-letter local part matching half the passwords in
  // existence and blocking signup for no reason.
  assert.equal(
    passwordStrengthIssue("plum tractor window", { email: "jo@example.com" }),
    null,
  );
});

test("the score rises with length and never exceeds its bounds", () => {
  assert.equal(passwordScore(""), 0);
  assert.ok(passwordScore("short") <= 1);
  const ok = passwordScore("plum tractor window");
  assert.ok(ok >= 2 && ok <= 4, `expected 2..4, got ${ok}`);
  assert.ok(passwordScore("plum tractor window rain garden") <= 4);
});

test("the score never reports a rejected password as strong", () => {
  for (const weak of ["password123", "abcabcabcabc", "qwertyuiop12"]) {
    assert.ok(passwordScore(weak) <= 1, `${weak} scored too high`);
  }
});
