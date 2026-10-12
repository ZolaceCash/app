import assert from "node:assert/strict"
import { test } from "node:test"

import { toZat } from "../lib/price"
import { BLOCKS, dollars, pretendItem, STEPS, sums, TURNS, walk } from "../lib/sell-try"

// The walk-through on /sell: a pretend item and one order of it. This is the part with no
// browser in it.

test("a pretend item is a name, a price in dollars and something to hand over", () => {
  assert.deepEqual(pretendItem("  Game   key ", "12.00", " ABCD-EFGH "), {
    ok: true,
    item: { name: "Game key", priceCents: 1200, code: "ABCD-EFGH" },
  })
  assert.deepEqual(pretendItem("Game key", "$5", "X"), { ok: true, item: { name: "Game key", priceCents: 500, code: "X" } })
  assert.deepEqual(pretendItem("Game key", "0.5", "X"), { ok: true, item: { name: "Game key", priceCents: 50, code: "X" } })
})

test("what is missing or cannot be a price is said by its field", () => {
  assert.deepEqual(pretendItem("  ", "12.00", "X"), { ok: false, field: "name" })
  assert.deepEqual(pretendItem("a".repeat(61), "12.00", "X"), { ok: false, field: "name" })
  for (const price of ["", "abc", "12.345", "-3", "0", "0.00", "1e3", "12,00", "99999"]) {
    assert.deepEqual(pretendItem("Game key", price, "X"), { ok: false, field: "price" }, price)
  }
  assert.deepEqual(pretendItem("Game key", "12.00", ""), { ok: false, field: "code" })
  assert.deepEqual(pretendItem("Game key", "12.00", "x".repeat(41)), { ok: false, field: "code" })
})

test("the walk goes through every step once, and waits three turns on the blocks", () => {
  const seen = Array.from({ length: TURNS + 1 }, (_, turn) => walk(turn))
  assert.deepEqual(
    seen.map((at) => STEPS[at.step].id),
    ["shelf", "address", "paid", "blocks", "blocks", "blocks", "opened", "opened"]
  )
  assert.deepEqual(
    seen.map((at) => at.blocks),
    [0, 0, 0, 0, 1, 2, BLOCKS, BLOCKS]
  )
  assert.deepEqual(
    seen.map((at) => at.done),
    [false, false, false, false, false, false, false, true]
  )
})

test("the walk does not run past its end, or before its start", () => {
  assert.deepEqual(walk(TURNS + 5), walk(TURNS))
  assert.deepEqual(walk(-2), walk(0))
})

test("the sums are the price at the rate, all of it the seller's", () => {
  const sum = sums(1200, 1307.28)
  assert.equal(sum.exact, (toZat(1200, 1307.28) / 100_000_000).toFixed(8).replace(/0+$/, ""))
  assert.equal(sum.about, "0.0092")
  assert.ok(Number(sum.about) >= Number(sum.exact))
})

test("without a rate there are no figures in ZEC, only the price", () => {
  assert.deepEqual(sums(1200, null), { about: null, exact: null })
  assert.deepEqual(sums(1200, 0), { about: null, exact: null })
  assert.equal(dollars(1200), "$12.00")
})
