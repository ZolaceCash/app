import assert from "node:assert/strict"
import { test } from "node:test"

import { formatZec, settle, toZat } from "../lib/price"

test("two sources that agree give their average", () => {
  const quote = settle(100, 101)
  assert.ok(quote.ok)
  assert.equal(quote.usdPerZec, 100.5)
})

test("a gap of exactly 2% is allowed, more is refused", () => {
  assert.ok(settle(100, 102).ok)
  assert.deepEqual(settle(100, 102.1), { ok: false, reason: "disagree" })
  assert.deepEqual(settle(102.1, 100), { ok: false, reason: "disagree" })
})

test("a source that did not answer means no price", () => {
  assert.deepEqual(settle(null, 100), { ok: false, reason: "unavailable" })
  assert.deepEqual(settle(100, 0), { ok: false, reason: "unavailable" })
})

test("a dollar price becomes zatoshi, rounded up", () => {
  assert.equal(toZat(1000, 1000), 1_000_000)
  assert.equal(toZat(1000, 1235.55), 809_357)
  assert.equal(formatZec(809_357), "0.00809357")
  assert.equal(formatZec(100_000_000), "1")
})
