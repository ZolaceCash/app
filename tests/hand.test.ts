import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, test } from "node:test"

// An item the owner buys by hand after its order is paid: the money comes first, the order is on
// the owner's list only once the payment is three blocks deep, and the owner hands the item over
// or the payment is owed back. Paid here with the stand-in, whose blocks come every four seconds.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

// The two price sources, answered from here.
globalThis.fetch = (async (input: RequestInfo | URL) =>
  new Response(
    JSON.stringify(String(input).includes("kraken") ? { result: { XZECZUSD: { c: ["1000"] } } } : { data: { amount: "1000" } })
  )) as typeof fetch

const MINUTE = 60_000
const HOUR = 60 * MINUTE
// Each test starts a day after the last, so no price quote, lock or wait is shared between them.
let clock = Date.UTC(2026, 9, 12)
const later = () => (clock += 24 * HOUR)

let orders: typeof import("@/lib/orders")
let admin: typeof import("@/lib/admin")
let seal: typeof import("@/lib/seal")

before(async () => {
  orders = await import("@/lib/orders")
  admin = await import("@/lib/admin")
  seal = await import("@/lib/seal")
  assert.deepEqual(await admin.createProduct({ slug: "gift-card", name: "Gift card $10", blurb: "", priceCents: 1150, byHand: true }), { ok: true })
  const made = (await admin.listProducts()).find((product) => product.slug === "gift-card")!
  assert.equal(made.kind, "hand")
  await admin.updateProduct(made.id, { name: made.name, blurb: "", priceCents: 1150, active: true })
})

async function place(now: number) {
  const keys = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug: "gift-card", publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
  assert.ok(result.ok)
  return { keys, id: result.id }
}

// An order that was paid, read again when its payment is three blocks deep.
async function paid(now: number) {
  const placed = await place(now)
  assert.ok(await orders.payTestOrder(placed.id, now + 1000))
  const view = await orders.readOrder(placed.id, now + MINUTE)
  return { ...placed, view, readyAt: now + MINUTE }
}

test("the item is on sale with nothing in stock, and takes none", async () => {
  const item = await orders.getItem("gift-card", later())
  assert.equal(item?.kind, "hand")
  assert.equal(item?.left, null)

  const made = (await admin.listProducts()).find((product) => product.slug === "gift-card")!
  assert.equal((await admin.addStock(made.id, "CODE-1")).ok, false)
})

test("nothing is on the owner's list before the money is in, three blocks deep", async () => {
  const now = later()
  const { id } = await place(now)
  const listed = async (at: number) => (await orders.listToBuy(at)).some((order) => order.id === id)

  // Ordered and not paid.
  assert.equal(await listed(now + 1000), false)
  assert.deepEqual(await orders.handOver(id, "CODE", now + 1000), { ok: false, reason: "not-waiting" })

  // Paid and seen, in no block yet; then in one block.
  await orders.payTestOrder(id, now + 2000)
  assert.equal(await listed(now + 3000), false)
  assert.equal(await listed(now + 7000), false)
  assert.deepEqual(await orders.handOver(id, "CODE", now + 7000), { ok: false, reason: "not-waiting" })
  assert.equal(await orders.cannotBuy(id), false)

  // Three blocks deep: now it is the owner's to buy, and the buyer is told by when.
  assert.equal(await listed(now + MINUTE), true)
  const view = await orders.readOrder(id, now + MINUTE + 1000)
  assert.equal(view?.state, "confirmed")
  assert.equal(view?.sealed, null)
  assert.equal(view?.handBy, now + MINUTE + 12 * HOUR)
  assert.equal(await orders.countToBuy(), 1)
  await orders.cannotBuy(id)
})

test("the owner hands the item over, and only the buyer can read it", async () => {
  const now = later()
  const { id, keys, view, readyAt } = await paid(now)
  assert.equal(view?.handBy, readyAt + 12 * HOUR)

  assert.deepEqual(await orders.handOver(id, "   ", readyAt + HOUR), { ok: false, reason: "bad-code" })
  assert.deepEqual(await orders.handOver(id, "x".repeat(2001), readyAt + HOUR), { ok: false, reason: "bad-code" })
  assert.deepEqual(await orders.handOver("no-such-order", "CODE", readyAt + HOUR), { ok: false, reason: "no-order" })
  assert.deepEqual(await orders.handOver(id, "  ABCD-1234-EFGH\nPIN 5678  ", readyAt + HOUR), { ok: true })

  const delivered = await orders.readOrder(id, readyAt + HOUR + 1000)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.handBy, null)
  assert.ok(delivered?.sealed)
  assert.equal(await seal.openSealed(keys.secret, delivered.wrappedKey, delivered.sealed), "ABCD-1234-EFGH\nPIN 5678")
  // The server kept the sealed copy and nothing it can read.
  assert.ok(!JSON.stringify(delivered).includes("ABCD-1234"))

  assert.ok(!(await orders.listToBuy(readyAt + 2 * HOUR)).some((order) => order.id === id))
  // Handed over once: not again, and it cannot be given up on afterwards.
  assert.deepEqual(await orders.handOver(id, "OTHER", readyAt + 2 * HOUR), { ok: false, reason: "not-waiting" })
  assert.equal(await orders.cannotBuy(id), false)
})

test("an item the owner cannot buy is owed back at once", async () => {
  const now = later()
  const { id, readyAt } = await paid(now)
  assert.equal(await orders.cannotBuy(id), true)

  const view = await orders.readOrder(id, readyAt + 1000)
  assert.equal(view?.state, "owed")
  assert.equal(view?.owedZat, view?.receivedZat)
  assert.ok((view?.owedZat ?? 0) > 0)
  assert.equal(view?.owedWhy, "no-item")
  assert.deepEqual(await orders.handOver(id, "CODE", readyAt + 2000), { ok: false, reason: "not-waiting" })
})

test("an item that is not handed over in time is owed back", async () => {
  const now = later()
  const { id, readyAt } = await paid(now)

  assert.equal((await orders.readOrder(id, readyAt + 12 * HOUR - MINUTE))?.state, "confirmed")
  // The owner's list moves it along too, even if the buyer never looks again.
  assert.ok(!(await orders.listToBuy(readyAt + 12 * HOUR + MINUTE)).some((order) => order.id === id))
  const view = await orders.readOrder(id, readyAt + 12 * HOUR + 2 * MINUTE)
  assert.equal(view?.state, "owed")
  assert.equal(view?.owedZat, view?.receivedZat)
  assert.deepEqual(await orders.handOver(id, "CODE", readyAt + 13 * HOUR), { ok: false, reason: "not-waiting" })
})

test("the time the owner has can be set", async () => {
  process.env.HAND_HOURS = "2"
  try {
    const now = later()
    const { id, view, readyAt } = await paid(now)
    assert.equal(orders.handHours(), 2)
    assert.equal(view?.handBy, readyAt + 2 * HOUR)
    assert.equal((await orders.readOrder(id, readyAt + 2 * HOUR + MINUTE))?.state, "owed")
  } finally {
    delete process.env.HAND_HOURS
  }
  assert.equal(orders.handHours(), 12)
})
