import assert from "node:assert/strict"
import { test } from "node:test"

import { longWait, noticeFor, settled, stageOf, tellKey } from "../lib/notice"

// A buyer's own browser tells them when their order moves. This is the part with no browser in
// it: which move is worth a notice, and what a notice may say.

const STAGES = ["waiting", "underpaid", "seen", "confirmed", "buying", "making", "delivered", "owed", "refunded", "expired"]

test("opening the page is not a move: the first look tells nothing", () => {
  for (const stage of STAGES) assert.equal(noticeFor(null, stage), null, stage)
})

test("an order that stayed where it was tells nothing", () => {
  for (const stage of STAGES) assert.equal(noticeFor(stage, stage), null, stage)
})

test("the moves a buyer waits for are each told", () => {
  assert.equal(noticeFor("waiting", "seen")?.title, "Your payment was seen")
  assert.equal(noticeFor("waiting", "underpaid")?.title, "More is needed for your order")
  assert.equal(noticeFor("buying", "delivered")?.title, "Your item is ready")
  assert.equal(noticeFor("confirmed", "owed")?.title, "A refund is owed to you")
  assert.equal(noticeFor("owed", "refunded")?.title, "Your refund was sent")
  assert.equal(noticeFor("waiting", "expired")?.title, "The price lock ran out")
})

test("an item from stock is handed over at once, so its confirmation is not told on its own", () => {
  assert.equal(noticeFor("seen", "confirmed"), null)
  assert.ok(noticeFor("confirmed", "delivered"))
})

test("an item that is bought or made after payment has a stage of its own, and it is told", () => {
  assert.equal(stageOf({ state: "confirmed", handBy: 1_760_000_000_000, making: false }), "buying")
  assert.equal(stageOf({ state: "confirmed", handBy: null, making: true }), "making")
  assert.equal(stageOf({ state: "confirmed", handBy: null, making: false }), "confirmed")
  assert.equal(noticeFor("seen", "buying")?.title, "Your payment is confirmed")
  assert.equal(noticeFor("confirmed", "making")?.title, "Your payment is confirmed")
  assert.ok(longWait("buying") && longWait("making") && !longWait("confirmed"))
})

test("outside a confirmed order the stage is the state", () => {
  for (const state of ["waiting", "underpaid", "seen", "delivered", "owed", "refunded", "expired"]) {
    assert.equal(stageOf({ state, handBy: null, making: false }), state)
  }
})

test("a state the page does not know tells nothing", () => {
  assert.equal(noticeFor("seen", "something-new"), null)
})

test("a notice is shown by the device, so it names no item, no amount and no order", () => {
  for (const from of STAGES) {
    for (const to of STAGES) {
      const notice = noticeFor(from, to)
      if (!notice) continue
      const words = `${notice.title} ${notice.body}`
      assert.doesNotMatch(words, /\d/, words)
      assert.doesNotMatch(words, /ZEC|\$|eSIM|Nitro|gift card/i, words)
    }
  }
})

test("only an order that will not move again is settled", () => {
  assert.ok(settled("delivered") && settled("refunded"))
  for (const stage of ["waiting", "underpaid", "seen", "confirmed", "buying", "making", "owed", "expired"]) {
    assert.equal(settled(stage), false, stage)
  }
})

test("the browser remembers the request under the order's name, which is not the secret", () => {
  assert.equal(tellKey("0a0z4g1t154a"), "zolace.tell.0a0z4g1t154a")
})
