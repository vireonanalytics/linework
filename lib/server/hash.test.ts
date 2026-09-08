import assert from "node:assert/strict";
import { test } from "node:test";
import { __setPepperForTests, hashIp, hashUserAgent, peppered } from "./hash.ts";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";

test("hashing is deterministic under one pepper", () => {
  __setPepperForTests("a-test-pepper-of-sufficient-length");
  assert.equal(hashUserAgent(UA), hashUserAgent(UA));
});

test("the raw value never appears in the hash", () => {
  __setPepperForTests("a-test-pepper-of-sufficient-length");
  const hash = hashUserAgent(UA)!;
  assert.ok(!hash.includes("iPhone"));
  assert.ok(!hash.includes("Mozilla"));
  assert.equal(hash.length, 32);
});

test("rotating the pepper severs the link to old hashes", () => {
  // This is the property that caps how long a pseudonymous identifier stays
  // useful, so it is worth asserting rather than assuming.
  __setPepperForTests("pepper-number-one-long-enough");
  const before = hashUserAgent(UA);

  __setPepperForTests("pepper-number-two-long-enough");
  const after = hashUserAgent(UA);

  assert.notEqual(before, after);
});

test("different kinds of value do not collide under one pepper", () => {
  __setPepperForTests("a-test-pepper-of-sufficient-length");
  // Hashing the same string as a UA and as an IP must not produce the same
  // digest, or the two namespaces could be cross-referenced.
  assert.notEqual(peppered("ua", "1.2.3.4"), peppered("ip", "1.2.3.4"));
});

test("absent values hash to null rather than to a constant", () => {
  __setPepperForTests("a-test-pepper-of-sufficient-length");
  assert.equal(hashUserAgent(null), null);
  assert.equal(hashUserAgent(""), null);
  assert.equal(hashIp(undefined), null);
});

test("a missing or weak pepper is a hard failure, not a warning", () => {
  // Falling back to an unsalted hash would silently break the no-PII promise,
  // because the space of real user agent strings is small enough to enumerate.
  const original = process.env.SESSION_HASH_SECRET;

  __setPepperForTests(null);
  delete process.env.SESSION_HASH_SECRET;
  assert.throws(() => hashUserAgent(UA), /SESSION_HASH_SECRET/);

  __setPepperForTests(null);
  process.env.SESSION_HASH_SECRET = "tooshort";
  assert.throws(() => hashUserAgent(UA), /SESSION_HASH_SECRET/);

  if (original === undefined) delete process.env.SESSION_HASH_SECRET;
  else process.env.SESSION_HASH_SECRET = original;
  __setPepperForTests(null);
});
