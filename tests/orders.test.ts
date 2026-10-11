import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, test } from "node:test"

// A database of its own, set before anything opens one.
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

// The two price sources, answered from here. Kraken first, Coinbase second (lib/price.ts).
let prices: [number, number] = [1000, 1000]
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const body = String(input).includes("kraken")
    ? { result: { XZECZUSD: { c: [String(prices[0])] } } }
    : { data: { amount: String(prices[1]) } }
  return new Response(JSON.stringify(body))
}) as typeof fetch

const MINUTE = 60_000
// Each test starts well after the last, so no price quote or lock is shared between them.
let clock = Date.UTC(2026, 9, 10)
const later = () => (clock += 60 * MINUTE)

let orders: typeof import("../lib/orders")
let seal: typeof import("../lib/seal")
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>
let schema: typeof import("../lib/db").schema

before(async () => {
  orders = await import("../lib/orders")
  seal = await import("../lib/seal")
  const database = await import("../lib/db")
  db = await database.getDb()
  schema = database.schema
  await db.insert(schema.products).values([
    { slug: "test-item", name: "Test item", blurb: "", priceCents: 1000, kind: "test" },
    { slug: "one-code", name: "One code", blurb: "", priceCents: 500, kind: "stock" },
  ])
  // An empty database also gets the shop's own test items when it is opened, so find ours by name.
  const stocked = (await db.select().from(schema.products)).find((product) => product.slug === "one-code")
  assert.ok(stocked)
  await db.insert(schema.stock).values({ productId: stocked.id, payload: "REAL-CODE-1" })
})

async function place(slug: string, now: number) {
  const keys = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug, publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
  return { keys, result }
}

test("a test order runs from checkout to the item opening with the link's secret", async () => {
  const now = later()
  const { keys, result } = await place("test-item", now)
  assert.ok(result.ok)

  const waiting = await orders.readOrder(result.id, now + 1000)
  assert.equal(waiting?.state, "waiting")
  assert.equal(waiting?.zat, 1_000_000)
  assert.equal(waiting?.sealed, null)

  assert.ok(await orders.payTestOrder(result.id, now + 2000))
  const seen = await orders.readOrder(result.id, now + 3000)
  assert.equal(seen?.state, "seen")
  assert.equal(seen?.confirmations, 0)

  const delivered = await orders.readOrder(result.id, now + MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.ok(delivered?.sealed)
  const item = await seal.openSealed(keys.secret, delivered.wrappedKey, delivered.sealed)
  assert.match(item, /^TEST-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
})

test("after delivery the server no longer has the readable item", async () => {
  const now = later()
  const { result } = await place("test-item", now)
  assert.ok(result.ok)
  await orders.payTestOrder(result.id, now)
  await orders.readOrder(result.id, now + MINUTE)

  const rows = await db.select().from(schema.stock)
  const mine = rows.find((row) => row.orderId === result.id)
  assert.equal(mine?.payload, null)
  assert.equal(mine?.state, "given")
})

test("an order that is not paid in 15 minutes expires and cannot be paid afterwards", async () => {
  const now = later()
  const { result } = await place("test-item", now)
  assert.ok(result.ok)

  assert.equal((await orders.readOrder(result.id, now + 14 * MINUTE))?.state, "waiting")
  assert.equal((await orders.readOrder(result.id, now + 16 * MINUTE))?.state, "expired")
  assert.equal(await orders.payTestOrder(result.id, now + 17 * MINUTE), false)
})

test("a code from the stock goes to one order, and back on the shelf if that order expires", async () => {
  const now = later()
  const first = await place("one-code", now)
  assert.ok(first.result.ok)
  assert.deepEqual((await place("one-code", now)).result, { ok: false, reason: "no-stock" })

  await orders.readOrder(first.result.id, now + 16 * MINUTE)
  const again = await place("one-code", now + 17 * MINUTE)
  assert.ok(again.result.ok)

  await orders.payTestOrder(again.result.id, now + 18 * MINUTE)
  const delivered = await orders.readOrder(again.result.id, now + 20 * MINUTE)
  assert.ok(delivered?.sealed)
  assert.equal(
    await seal.openSealed(again.keys.secret, delivered.wrappedKey, delivered.sealed),
    "REAL-CODE-1"
  )
})

test("no order is started while the two price sources disagree", async () => {
  prices = [1000, 1100]
  assert.deepEqual((await place("test-item", later())).result, { ok: false, reason: "price-disagree" })
  prices = [1000, 1000]
})

test("an unknown product or order is refused", async () => {
  assert.deepEqual((await place("nothing-here", later())).result, { ok: false, reason: "no-product" })
  assert.equal(await orders.readOrder("no-such-order"), null)
})
