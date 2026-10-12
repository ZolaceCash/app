import assert from "node:assert/strict"
import { test } from "node:test"

import { giftPath, giftState } from "../lib/gift"

// A gift's link is the order's own name and secret on another page. These are the two things the
// pages ask of it: what the link is, and what a gift's page says of the order behind it.

const SECRET = "u2R-PB0g6PJVCiNLRsDaScjohzAgcHbHbpm_ZlL9oNU"

test("a gift's link is the order's name on the gift's page, then #, then the same secret", () => {
  assert.equal(giftPath("0a0z4g1t154a", SECRET), `/g/0a0z4g1t154a#${SECRET}`)
})

test("there is no gift's link without the secret, or without the order", () => {
  assert.equal(giftPath("0a0z4g1t154a", ""), null)
  assert.equal(giftPath("", SECRET), null)
})

test("a gift opens only once its order is delivered", () => {
  assert.equal(giftState("delivered"), "open")
  for (const state of ["waiting", "underpaid", "seen", "confirmed"]) assert.equal(giftState(state), "not-yet", state)
  for (const state of ["expired", "owed", "refunded"]) assert.equal(giftState(state), "not-completed", state)
})

test("a state the page does not know is taken as not ready, never as open", () => {
  assert.equal(giftState("something-new"), "not-yet")
})
