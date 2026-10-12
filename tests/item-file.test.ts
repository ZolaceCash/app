import assert from "node:assert/strict"
import { test } from "node:test"

import { esimParts, itemFile } from "../lib/item-file"

// An item saved as a file on the buyer's own device. This is the part with no browser in it:
// what the file is called and what it says.

const SAVED = Date.UTC(2026, 9, 12, 23, 30)
const ESIM = "LPA:1$rsp.example.net$K2-1ABC-DEF"

test("the file is named after the item, in letters, digits and hyphens", () => {
  assert.equal(itemFile("Discord Nitro, 1 month (USD)", "ABCD-EFGH", SAVED).name, "zolace-discord-nitro-1-month-usd.txt")
  assert.equal(itemFile("US data eSIM, 1 GB, 7 days", ESIM, SAVED).name, "zolace-us-data-esim-1-gb-7-days.txt")
})

test("a name with nothing usable in it, or a very long one, still makes a file's name", () => {
  assert.equal(itemFile("…", "X", SAVED).name, "zolace-item.txt")
  assert.equal(itemFile("../../etc/passwd", "X", SAVED).name, "zolace-etc-passwd.txt")
  const long = itemFile("a".repeat(39) + " b" + "c".repeat(80), "X", SAVED).name
  assert.match(long, /^zolace-[a-z0-9-]{1,40}\.txt$/)
  assert.doesNotMatch(long, /-\.txt$/)
})

test("the file holds the item, whole and on a line of its own", () => {
  const { body } = itemFile("Test licence key", "  TEST-MV4G-XX27-EMAC\n", SAVED)
  assert.ok(body.split("\n").includes("TEST-MV4G-XX27-EMAC"))
  assert.ok(body.startsWith("Zolace: Test licence key\n"))
})

test("it says the day it was saved, in UTC", () => {
  assert.ok(itemFile("Test licence key", "X", SAVED).body.includes("Saved on 2026-10-12 (UTC)"))
})

test("an eSIM is also written as its two parts", () => {
  const { body } = itemFile("US data eSIM, 1 GB, 7 days", ESIM, SAVED)
  assert.ok(body.split("\n").includes(ESIM))
  assert.ok(body.includes("SM-DP+ address: rsp.example.net"))
  assert.ok(body.includes("Activation code: K2-1ABC-DEF"))
})

test("an item that is not an eSIM has no such parts", () => {
  assert.equal(esimParts("ABCD-EFGH"), null)
  assert.equal(esimParts("LPA:1$only-one-part"), null)
  assert.doesNotMatch(itemFile("Discord Nitro", "ABCD-EFGH", SAVED).body, /SM-DP\+/)
})

test("the file says plainly that it is not sealed and that it was sent nowhere", () => {
  const { body } = itemFile("Discord Nitro", "ABCD-EFGH", SAVED)
  assert.match(body, /It is not sealed: whoever can read this file has the item\./)
  assert.match(body, /was not sent to the shop/)
})

test("the file has no price, no amount and no link in it", () => {
  const { body } = itemFile("Discord Nitro", "ABCD-EFGH", SAVED)
  assert.doesNotMatch(body, /\$\d|ZEC|https?:|\/o\/|\/g\/|#/)
})
