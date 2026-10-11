import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, test } from "node:test"

// A database of its own, set before anything opens one.
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

// The two price sources, answered from here (lib/price.ts).
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const body = String(input).includes("kraken")
    ? { result: { XZECZUSD: { c: ["1000"] } } }
    : { data: { amount: "1000" } }
  return new Response(JSON.stringify(body))
}) as typeof fetch

// Made up for this test. It opens nothing anywhere else.
const SECRET = "test-owner-secret-0123456789-abcdefghij"
const MINUTE = 60_000
let clock = Date.UTC(2026, 9, 11)
const later = () => (clock += 60 * MINUTE)

let owner: typeof import("../lib/owner")
let admin: typeof import("../lib/admin")
let orders: typeof import("../lib/orders")
let seal: typeof import("../lib/seal")
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>
let schema: typeof import("../lib/db").schema

before(async () => {
  owner = await import("../lib/owner")
  admin = await import("../lib/admin")
  orders = await import("../lib/orders")
  seal = await import("../lib/seal")
  const database = await import("../lib/db")
  db = await database.getDb()
  schema = database.schema
})

async function order(slug: string, now: number) {
  const keys = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug, publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
  assert.ok(result.ok, "the order should start")
  return result.id
}

// ---- signing in

test("with no secret set, or a short one, the owner's screens are off", () => {
  delete process.env.OWNER_SECRET
  assert.equal(owner.ownerEnabled(), false)
  assert.equal(owner.isOwnerSecret(""), false)
  assert.equal(owner.newSession(), null)

  process.env.OWNER_SECRET = "too-short"
  assert.equal(owner.ownerEnabled(), false)
  assert.equal(owner.isOwnerSecret("too-short"), false)
  assert.equal(owner.newSession(), null)
})

test("only the secret itself signs the owner in", () => {
  process.env.OWNER_SECRET = SECRET
  assert.equal(owner.ownerEnabled(), true)
  assert.equal(owner.isOwnerSecret(SECRET), true)
  assert.equal(owner.isOwnerSecret(SECRET + " "), false)
  assert.equal(owner.isOwnerSecret(SECRET.slice(0, -1)), false)
  assert.equal(owner.isOwnerSecret(""), false)
})

test("a session is good until it runs out, and not a moment longer", () => {
  process.env.OWNER_SECRET = SECRET
  const now = later()
  const session = owner.newSession(now)
  assert.ok(session)
  assert.equal(session.expiresAt, now + owner.SESSION_MS)
  assert.equal(owner.isSession(session.token, now), true)
  assert.equal(owner.isSession(session.token, session.expiresAt - 1), true)
  assert.equal(owner.isSession(session.token, session.expiresAt), false)
})

test("a session that was changed, or made with another secret, is refused", () => {
  process.env.OWNER_SECRET = SECRET
  const now = later()
  const session = owner.newSession(now)
  assert.ok(session)
  const [expiresAt, mac] = session.token.split(".")

  // Pushing the expiry out without the secret does not work.
  assert.equal(owner.isSession(`${Number(expiresAt) + 1}.${mac}`, now), false)
  assert.equal(owner.isSession(`${expiresAt}.${mac.slice(0, -1)}A`, now), false)
  assert.equal(owner.isSession(`${expiresAt}.`, now), false)
  assert.equal(owner.isSession(`${expiresAt}.${mac}.x`, now), false)
  assert.equal(owner.isSession("", now), false)
  assert.equal(owner.isSession(undefined, now), false)

  // Changing the secret ends every session made with the old one.
  process.env.OWNER_SECRET = SECRET + "-changed"
  assert.equal(owner.isSession(session.token, now), false)
  process.env.OWNER_SECRET = SECRET
  assert.equal(owner.isSession(session.token, now), true)
})

// ---- items and stock

test("a price is read as the owner types it", () => {
  assert.equal(admin.parsePrice("12"), 1200)
  assert.equal(admin.parsePrice("12.5"), 1250)
  assert.equal(admin.parsePrice(" 0.99 "), 99)
  assert.equal(admin.parsePrice("0"), null)
  assert.equal(admin.parsePrice("-5"), null)
  assert.equal(admin.parsePrice("12.345"), null)
  assert.equal(admin.parsePrice("twelve"), null)
  assert.equal(admin.parsePrice(""), null)
})

test("a new item starts off the shelf and goes on it when the owner says so", async () => {
  const made = await admin.createProduct({ slug: "game-voucher", name: "Game voucher", blurb: "One code.", priceCents: 1500 })
  assert.deepEqual(made, { ok: true })

  assert.equal(await orders.getItem("game-voucher", later()), null)

  const [product] = (await admin.listProducts()).filter((row) => row.slug === "game-voucher")
  assert.equal(product.kind, "stock")
  assert.equal(product.active, false)

  const changed = await admin.updateProduct(product.id, { name: "Game voucher", blurb: "One code.", priceCents: 1800, active: true })
  assert.deepEqual(changed, { ok: true })

  const item = await orders.getItem("game-voucher", later())
  assert.equal(item?.priceCents, 1800)
  assert.equal(item?.left, 0)
})

test("an item that cannot be right is refused", async () => {
  const input = { name: "Item", blurb: "", priceCents: 500 }
  assert.equal((await admin.createProduct({ ...input, slug: "Has Spaces" })).ok, false)
  assert.equal((await admin.createProduct({ ...input, slug: "-leading" })).ok, false)
  assert.equal((await admin.createProduct({ ...input, slug: "double--dash" })).ok, false)
  assert.equal((await admin.createProduct({ ...input, slug: "fine", name: "" })).ok, false)
  assert.equal((await admin.createProduct({ ...input, slug: "fine", priceCents: 0 })).ok, false)
  assert.equal((await admin.createProduct({ ...input, slug: "fine", priceCents: 1.5 })).ok, false)

  // The link name is taken once.
  assert.equal((await admin.createProduct({ ...input, slug: "game-voucher" })).ok, false)
  assert.equal((await admin.updateProduct(999_999, { ...input, active: true })).ok, false)
})

test("codes go on the shelf one per line, and only for an item that takes stock", async () => {
  const [product] = (await admin.listProducts()).filter((row) => row.slug === "game-voucher")

  const added = await admin.addStock(product.id, "AAAA-1111\r\n\n  BBBB-2222  \nCCCC-3333\n")
  assert.deepEqual(added, { ok: true, added: 3 })

  const [stocked] = (await admin.listProducts()).filter((row) => row.slug === "game-voucher")
  assert.deepEqual([stocked.free, stocked.held, stocked.given], [3, 0, 0])
  assert.equal((await orders.getItem("game-voucher", later()))?.left, 3)

  assert.equal((await admin.addStock(product.id, " \n \n")).ok, false)
  assert.equal((await admin.addStock(999_999, "CODE")).ok, false)

  const [testItem] = (await admin.listProducts()).filter((row) => row.kind === "test")
  assert.equal((await admin.addStock(testItem.id, "CODE")).ok, false)
})

test("what the owner's screens list never holds a code or a key", async () => {
  const listed = JSON.stringify([await admin.listProducts(), await admin.listOrders(later())])
  assert.ok(!listed.includes("AAAA-1111"))
  assert.ok(!listed.includes("payload"))
  assert.ok(!listed.includes("wrappedKey"))
  assert.ok(!listed.includes("publicKey"))
  assert.ok(!listed.includes("sealed"))
})

// ---- orders

test("an order nobody came back to is closed, and its code goes back on the shelf", async () => {
  const placed = later()
  const id = await order("game-voucher", placed)
  assert.equal((await orders.getItem("game-voucher", placed + MINUTE))?.left, 2)

  // Nobody reads the order again. Listing the shelf after the lock ran out is enough.
  const after = placed + orders.LOCK_MS + MINUTE
  assert.equal((await orders.getItem("game-voucher", after))?.left, 3)

  const [closed] = (await admin.listOrders(after)).filter((row) => row.id === id)
  assert.equal(closed.state, "expired")
  assert.equal(closed.product, "Game voucher")
})

test("the owner's list shows an order as it moves, newest first", async () => {
  // Both inside one price lock, so neither has run out when the list is read.
  const placed = later()
  const first = await order("game-voucher", placed)
  const second = await order("game-voucher", placed + MINUTE)

  const listed = await admin.listOrders(placed + 2 * MINUTE)
  assert.ok(listed.findIndex((row) => row.id === second) < listed.findIndex((row) => row.id === first))
  assert.equal(listed.find((row) => row.id === second)?.state, "waiting")

  const counts = await admin.countOrders()
  assert.equal(counts.waiting, 2)
  assert.ok((counts.expired ?? 0) >= 1)
})

test("a paid order with nothing to hand over joins the refund queue until the owner clears it", async () => {
  const placed = later()
  const id = await order("test-licence", placed)
  // The made-up code set aside for it goes missing before the payment is confirmed.
  const [row] = await db.select().from(schema.orders).where((await import("drizzle-orm")).eq(schema.orders.id, id))
  await db
    .update(schema.stock)
    .set({ payload: null })
    .where((await import("drizzle-orm")).eq(schema.stock.id, row.stockId!))

  assert.ok(await orders.payTestOrder(id, placed + MINUTE))
  const stuck = await orders.readOrder(id, placed + 5 * MINUTE)
  assert.equal(stuck?.state, "owed")
  assert.equal(stuck?.owedWhy, "no-item")
  assert.equal(stuck?.sealed, null)

  const queue = await admin.listRefundsDue()
  assert.deepEqual(
    queue.map((entry) => entry.id),
    [id]
  )

  assert.equal(await admin.markRefunded(id, placed + 10 * MINUTE), true)
  assert.deepEqual(await admin.listRefundsDue(), [])
  assert.equal((await orders.readOrder(id, placed + 11 * MINUTE))?.state, "refunded")

  // Only an order that is owed a refund can be marked, and only once.
  assert.equal(await admin.markRefunded(id, placed + 12 * MINUTE), false)
  const open = await order("game-voucher", later())
  assert.equal(await admin.markRefunded(open, clock + MINUTE), false)
  assert.equal(await admin.markRefunded("no-such-order", clock), false)
})
