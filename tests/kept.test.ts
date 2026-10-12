import assert from "node:assert/strict"
import { test } from "node:test"

import { isKept, KEPT_MOST, keptHref, readKept, withKept, withoutKept, type Kept } from "../lib/kept"

// The orders a buyer has the browser keep. The list lives in the browser's storage, which can
// hold anything, so reading it has to be strict about what a kept order is.

const SECRET = "u2R-PB0g6PJVCiNLRsDaScjohzAgcHbHbpm_ZlL9oNU"
const order = (id: string, keptAt: number, more: Partial<Kept> = {}): Kept => ({
  id,
  secret: SECRET,
  item: "US data eSIM, 1 GB, 7 days",
  priceCents: 599,
  keptAt,
  ...more,
})

test("an empty or broken storage holds no kept order", () => {
  assert.deepEqual(readKept(null), [])
  assert.deepEqual(readKept(""), [])
  assert.deepEqual(readKept("not json"), [])
  assert.deepEqual(readKept('{"id":"0a0z4g1t"}'), [])
})

test("what is not a whole kept order is left out, and the rest comes newest first", () => {
  const good = [order("0a0z4g1t154a", 1_000), order("1w1c0d310e5n", 3_000)]
  const text = JSON.stringify([
    good[0],
    { ...order("2b2b2b2b2b2b", 2_000), secret: "" },
    { ...order("3c3c3c3c3c3c", 2_000), secret: "has spaces in it, so not a secret" },
    { ...order("UPPER-CASE!", 2_000) },
    { ...order("4d4d4d4d4d4d", 2_000), priceCents: 5.99 },
    { ...order("5e5e5e5e5e5e", 2_000), item: "" },
    "a string",
    null,
    good[1],
  ])
  assert.deepEqual(
    readKept(text).map((kept) => kept.id),
    ["1w1c0d310e5n", "0a0z4g1t154a"]
  )
})

test("an order written twice is read once, as it was last kept", () => {
  const text = JSON.stringify([order("0a0z4g1t154a", 1_000), order("0a0z4g1t154a", 2_000, { item: "Later" })])
  assert.deepEqual(readKept(text), [order("0a0z4g1t154a", 2_000, { item: "Later" })])
})

test("keeping an order puts it first, and keeping it again does not double it", () => {
  const one = withKept([], order("0a0z4g1t154a", 1_000))
  assert.ok(one)
  const two = withKept(one, order("1w1c0d310e5n", 2_000))
  assert.ok(two)
  assert.deepEqual(
    two.map((kept) => kept.id),
    ["1w1c0d310e5n", "0a0z4g1t154a"]
  )
  const again = withKept(two, order("0a0z4g1t154a", 3_000))
  assert.ok(again)
  assert.deepEqual(
    again.map((kept) => [kept.id, kept.keptAt]),
    [
      ["0a0z4g1t154a", 3_000],
      ["1w1c0d310e5n", 2_000],
    ]
  )
})

test("a link with no secret is not kept", () => {
  assert.equal(withKept([], order("0a0z4g1t154a", 1_000, { secret: "" })), null)
})

test("no more than the most are kept, and the oldest go first", () => {
  let list: Kept[] = []
  for (let n = 0; n < KEPT_MOST + 3; n++) list = withKept(list, order(`order${String(n).padStart(4, "0")}`, 1_000 + n)) ?? list
  assert.equal(list.length, KEPT_MOST)
  assert.equal(list[0].id, `order${String(KEPT_MOST + 2).padStart(4, "0")}`)
  assert.equal(list.at(-1)?.id, "order0003")
})

test("forgetting takes one order out and leaves the others", () => {
  const list = [order("1w1c0d310e5n", 2_000), order("0a0z4g1t154a", 1_000)]
  assert.deepEqual(
    withoutKept(list, "1w1c0d310e5n").map((kept) => kept.id),
    ["0a0z4g1t154a"]
  )
  assert.deepEqual(withoutKept(list, "nothere00000"), list)
})

test("an order counts as kept only with the secret it was kept with", () => {
  const list = [order("0a0z4g1t154a", 1_000)]
  assert.equal(isKept(list, "0a0z4g1t154a", SECRET), true)
  assert.equal(isKept(list, "0a0z4g1t154a", "another-secret-of-enough-length"), false)
  assert.equal(isKept(list, "1w1c0d310e5n", SECRET), false)
})

test("the link is the order's name, then #, then its secret", () => {
  assert.equal(keptHref(order("0a0z4g1t154a", 1_000)), `/o/0a0z4g1t154a#${SECRET}`)
})
