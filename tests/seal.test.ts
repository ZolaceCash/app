import assert from "node:assert/strict"
import { test } from "node:test"

import { isPublicKey, isWrapped, newOrderKeys, openSealed, sealTo } from "../lib/seal"

test("an item sealed to an order's key opens with that order's secret", async () => {
  const keys = await newOrderKeys()
  const sealed = await sealTo(keys.publicKey, "TEST-ABCD-EFGH-JKLM")
  assert.equal(await openSealed(keys.secret, keys.wrappedKey, sealed), "TEST-ABCD-EFGH-JKLM")
})

test("another order's secret cannot open it", async () => {
  const mine = await newOrderKeys()
  const theirs = await newOrderKeys()
  const sealed = await sealTo(mine.publicKey, "TEST-ABCD-EFGH-JKLM")
  await assert.rejects(openSealed(theirs.secret, mine.wrappedKey, sealed))
})

test("the sealed copy does not contain the item", async () => {
  const keys = await newOrderKeys()
  const sealed = await sealTo(keys.publicKey, "TEST-ABCD-EFGH-JKLM")
  assert.ok(!JSON.stringify(sealed).includes("TEST-ABCD"))
  assert.ok(!JSON.stringify(keys.wrappedKey).includes(keys.secret))
})

test("what the browser sends passes the server's checks, and junk does not", async () => {
  const keys = await newOrderKeys()
  assert.ok(isPublicKey(keys.publicKey))
  assert.ok(isWrapped(keys.wrappedKey))
  assert.ok(!isPublicKey({ kty: "EC", crv: "P-256", x: "short", y: "short" }))
  assert.ok(!isPublicKey({ ...keys.publicKey, crv: "P-384" }))
  assert.ok(!isWrapped({ iv: "ok", data: "x".repeat(500) }))
  assert.ok(!isWrapped(null))
})
