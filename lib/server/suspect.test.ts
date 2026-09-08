import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_PLAUSIBLE_DRAW_MS,
  assessGuess,
  deviceTypeFrom,
  isHeadlessAgent,
  referrerHostFrom,
} from "./suspect.ts";

const REAL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const HUMAN_PATH = [500, 498, 491, 480, 470, 455, 440, 430, 421, 410];

function guess(overrides: Partial<Parameters<typeof assessGuess>[0]> = {}) {
  return assessGuess({
    path: HUMAN_PATH,
    drawMs: 2400,
    isDuplicate: false,
    userAgent: REAL_UA,
    ...overrides,
  });
}

test("a normal guess is not flagged", () => {
  const verdict = guess();
  assert.equal(verdict.isSuspect, false);
  assert.deepEqual(verdict.reasons, []);
});

test("a perfectly flat path is flagged", () => {
  const verdict = guess({ path: new Array(40).fill(500) });
  assert.ok(verdict.isSuspect);
  assert.ok(verdict.reasons.includes("zero-variance"));
});

test("a path drawn faster than a person could decide is flagged", () => {
  assert.ok(guess({ drawMs: MIN_PLAUSIBLE_DRAW_MS - 1 }).reasons.includes("too-fast"));
  assert.ok(!guess({ drawMs: MIN_PLAUSIBLE_DRAW_MS }).reasons.includes("too-fast"));
});

test("a second guess on the same dataset in one session is flagged", () => {
  assert.ok(guess({ isDuplicate: true }).reasons.includes("duplicate-in-session"));
});

test("reasons accumulate rather than short-circuiting", () => {
  // An exclusion has to be explainable, and "it was flagged for one of four
  // things" is not an explanation.
  const verdict = guess({
    path: new Array(40).fill(0),
    drawMs: 10,
    isDuplicate: true,
    userAgent: "HeadlessChrome/120.0.0.0",
  });
  assert.equal(verdict.reasons.length, 4);
});

test("self-identifying automation is caught", () => {
  for (const ua of [
    "HeadlessChrome/120.0.0.0",
    "Mozilla/5.0 ... PhantomJS/2.1.1",
    "Playwright/1.40",
    "python-requests/2.31.0",
    "curl/8.4.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "node-fetch/1.0",
  ]) {
    assert.ok(isHeadlessAgent(ua), `${ua} should be flagged`);
  }
});

test("a missing or stub user agent counts as headless", () => {
  // Every real browser sends one. Absence is itself the signal.
  assert.ok(isHeadlessAgent(null));
  assert.ok(isHeadlessAgent(""));
  assert.ok(isHeadlessAgent("   "));
  assert.ok(isHeadlessAgent("x"));
});

test("real browsers are not flagged as headless", () => {
  for (const ua of [
    REAL_UA,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  ]) {
    assert.ok(!isHeadlessAgent(ua), `${ua} should NOT be flagged`);
  }
});

test("device type buckets are coarse enough to be safe to store", () => {
  assert.equal(deviceTypeFrom(REAL_UA), "mobile");
  assert.equal(
    deviceTypeFrom("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15"),
    "tablet",
  );
  assert.equal(
    deviceTypeFrom(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    ),
    "desktop",
  );
  assert.equal(deviceTypeFrom(null), "unknown");
});

test("android tablets are not misread as phones", () => {
  const tablet =
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const phone =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  assert.equal(deviceTypeFrom(tablet), "tablet");
  assert.equal(deviceTypeFrom(phone), "mobile");
});

test("only the referrer host is kept, never the query string", () => {
  assert.equal(
    referrerHostFrom("https://news.ycombinator.com/item?id=12345&utm_source=x"),
    "news.ycombinator.com",
  );
  assert.equal(referrerHostFrom("https://EXAMPLE.com/path"), "example.com");
  assert.equal(referrerHostFrom(null), null);
  assert.equal(referrerHostFrom("not a url"), null);
});

test("our own pages are not recorded as a referrer", () => {
  assert.equal(
    referrerHostFrom("https://drawtheline.app/play", "drawtheline.app"),
    null,
  );
});
