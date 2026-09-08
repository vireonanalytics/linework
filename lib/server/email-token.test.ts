import test from "node:test";
import assert from "node:assert/strict";
import {
  hashToken,
  mintToken,
  tokenLink,
  isExpired,
  TOKEN_TTL_MS,
} from "./email-token.ts";

test("a minted token is high entropy and never repeats", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const { raw } = mintToken("reset_password");
    assert.ok(raw.length >= 40, `token too short: ${raw.length} chars`);
    assert.ok(!seen.has(raw), "mintToken produced a duplicate");
    seen.add(raw);
  }
});

test("tokens are url-safe so a mail client cannot mangle them", () => {
  for (let i = 0; i < 200; i += 1) {
    const { raw } = mintToken("reset_password");
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
    // Round-trips through a URL unchanged - no escaping, no re-encoding.
    assert.equal(new URL(tokenLink("https://x.test", "/reset", raw)).searchParams.get("token"), raw);
  }
});

test("the hash is stable, and the raw token is not recoverable from it", () => {
  const { raw, hash } = mintToken("reset_password");
  assert.equal(hashToken(raw), hash);
  assert.equal(hash.length, 64);
  assert.ok(!hash.includes(raw));
  assert.notEqual(hash, raw);
});

test("different tokens hash differently", () => {
  const a = mintToken("reset_password");
  const b = mintToken("reset_password");
  assert.notEqual(a.hash, b.hash);
});

test("a reset token is short lived", () => {
  /*
   * A reset link IS the account while it lives, so the window has to stay
   * small. Asserted as a ceiling rather than an equality so tightening it
   * later does not fail the test, but loosening it does.
   */
  assert.ok(
    TOKEN_TTL_MS.reset_password <= 60 * 60 * 1000,
    "a password-reset token must not outlive an hour",
  );
});

test("expiry is computed from the mint time", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const { expiresAt } = mintToken("reset_password", now);
  assert.equal(expiresAt.toISOString(), "2026-08-27T13:00:00.000Z");
  assert.equal(isExpired(expiresAt, now), false);
  assert.equal(isExpired(expiresAt, new Date("2026-08-27T12:59:59.000Z")), false);
  assert.equal(isExpired(expiresAt, new Date("2026-08-27T13:00:00.000Z")), true);
});

test("the link is built from configuration, never from a request header", () => {
  const raw = "abc-123_XYZ";
  assert.equal(
    tokenLink("https://linework.cc", "/reset", raw),
    "https://linework.cc/reset?token=abc-123_XYZ",
  );
  // A trailing slash in the configured URL must not produce a double slash.
  assert.equal(
    tokenLink("https://linework.cc/", "/reset", raw),
    "https://linework.cc/reset?token=abc-123_XYZ",
  );
});

test("a token containing url-significant characters survives the round trip", () => {
  /*
   * base64url never produces these, but tokenLink must not silently depend on
   * that - a future change to the alphabet should not become an auth bug.
   */
  const raw = "a+b/c=d&e?f";
  const link = tokenLink("https://x.test", "/reset", raw);
  assert.equal(new URL(link).searchParams.get("token"), raw);
});
