import assert from "node:assert/strict"
import { test } from "node:test"

import { aboutZec, formatZec, RATE_MS, rateNow, settle, toZat } from "../lib/price"

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

test("a page says about what a price is in ZEC: four places, rounded up", () => {
  // 11.90 dollars at 334.12 is 0.03561594... ZEC.
  assert.equal(aboutZec(1190, 334.12), "0.0357")
  assert.equal(aboutZec(1000, 1000), "0.0100")
  // Never less than the order will ask for.
  for (const [cents, rate] of [[599, 334.12], [1190, 41.07], [2500, 987.65]] as const) {
    assert.ok(Number(aboutZec(cents, rate)) * 100_000_000 >= toZat(cents, rate), `${cents} at ${rate}`)
  }
})

test("the rate for readers is asked of the sources once, then reused, also when there is none", async () => {
  const real = globalThis.fetch
  let asked = 0
  let up = true
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked++
    if (!up) return new Response("no", { status: 503 })
    const body = String(input).includes("kraken") ? { result: { XZECZUSD: { c: ["300"] } } } : { data: { amount: "302" } }
    return new Response(JSON.stringify(body))
  }) as typeof fetch
  try {
    const start = Date.UTC(2026, 9, 12)
    const first = await rateNow(start)
    assert.deepEqual(first, { ok: true, usdPerZec: 301, at: start })
    assert.equal(asked, 2)
    // Many readers within the time get the same answer, and the sources hear nothing.
    for (let i = 1; i <= 5; i++) assert.deepEqual(await rateNow(start + i * 1000), first)
    assert.equal(asked, 2)

    // Later, with the sources down: one try, and its answer is reused as well.
    up = false
    const later = start + 10 * 60_000
    assert.deepEqual(await rateNow(later), { ok: false, reason: "unavailable" })
    const tries = asked
    assert.deepEqual(await rateNow(later + RATE_MS - 1), { ok: false, reason: "unavailable" })
    assert.equal(asked, tries)

    // And once the time is over it asks again.
    up = true
    const again = await rateNow(later + RATE_MS)
    assert.ok(again.ok && again.usdPerZec === 301 && again.at === later + RATE_MS)
  } finally {
    globalThis.fetch = real
  }
})
