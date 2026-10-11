import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, test } from "node:test"

// A buyer reports that the item they were handed does not work, and the owner answers. The orders
// are written straight into the database as already handed over: how an order gets that far is
// tests/payment.test.ts.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

// The two price sources, answered from here: placing an order asks them.
globalThis.fetch = (async (input: RequestInfo | URL) =>
  new Response(
    JSON.stringify(String(input).includes("kraken") ? { result: { XZECZUSD: { c: ["1000"] } } } : { data: { amount: "1000" } })
  )) as typeof fetch

const ADDRESS = "utest1eyxyvdjxyc20xyf66rttcsxgmhtt8xewaaylfg5tn5v57h57nsvcmk9jy3qfszxjjg298dwpk0fjwc2e2h576sq7gmshhgyrzc05wcr0"
const ADDRESS_2 = "utest1pmslle44wr0egglc2ec6dxglu6k3qmca2xkrmpcfr8hl5kqpkt9mwxy5lu00qut7xke3sudxtckm5l0x7f2yk3403peep4hppykhh5jn"
const NOTE = "The phone says the activation code is not valid."
const DAY = 24 * 60 * 60 * 1000

let orders: typeof import("@/lib/orders")
let admin: typeof import("@/lib/admin")
let seal: typeof import("@/lib/seal")
let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>
let schema: typeof import("@/lib/db").schema
let productId: number

before(async () => {
  orders = await import("@/lib/orders")
  admin = await import("@/lib/admin")
  seal = await import("@/lib/seal")
  const database = await import("@/lib/db")
  db = await database.getDb()
  schema = database.schema
  await admin.createProduct({ slug: "data-plan", name: "Data plan", blurb: "", priceCents: 599 })
  // An empty database also gets the shop's own test items when it is opened, so find ours by name.
  productId = (await admin.listProducts()).find((product) => product.slug === "data-plan")!.id
})

// An order as the shop leaves it: paid for with coins of the test network unless `test`, and in
// the state given.
async function order(id: string, values: Partial<typeof schema.orders.$inferInsert> = {}) {
  const now = Date.now()
  await db.insert(schema.orders).values({
    id,
    productId,
    state: "delivered",
    priceCents: 599,
    zat: 600_000,
    receivedZat: 600_000,
    address: "utest1madeupfortheorder",
    publicKey: "{}",
    wrappedKey: "{}",
    test: false,
    createdAt: now - 60 * 60 * 1000,
    expiresAt: now - 45 * 60 * 1000,
    deliveredAt: now - 50 * 60 * 1000,
    closedAt: now - 50 * 60 * 1000,
    ...values,
  })
  return id
}

const row = async (id: string) => (await db.select().from(schema.orders).where((await import("drizzle-orm")).eq(schema.orders.id, id)))[0]

test("a report is taken for an order that was handed over, and only with what the owner needs", async () => {
  const id = await order("reported-1")

  assert.deepEqual(await orders.reportProblem("no-such-order", NOTE, ADDRESS), { ok: false, reason: "no-order" })
  assert.deepEqual(await orders.reportProblem(id, "Broken", ADDRESS), { ok: false, reason: "bad-note" })
  assert.deepEqual(await orders.reportProblem(id, "x".repeat(501), ADDRESS), { ok: false, reason: "bad-note" })
  // The address has to be a shielded one of the order's own network, whole.
  assert.deepEqual(await orders.reportProblem(id, NOTE, ADDRESS.slice(0, -1) + "q"), { ok: false, reason: "bad-address" })
  assert.deepEqual(await orders.reportProblem(id, NOTE, ""), { ok: false, reason: "bad-address" })
  assert.equal((await row(id)).problem, null)

  assert.deepEqual(await orders.reportProblem(id, `  ${NOTE}  `, ADDRESS), { ok: true })
  const kept = await row(id)
  assert.equal(kept.problem, NOTE)
  assert.equal(kept.refundAddress, ADDRESS)
  assert.equal(kept.state, "delivered")
  assert.equal(kept.owedZat, 0)
})

test("nothing can be reported about an order that handed nothing over, or a made-up one", async () => {
  for (const state of ["waiting", "seen", "confirmed", "expired", "owed", "refunded"] as const) {
    const id = await order(`not-delivered-${state}`, { state })
    assert.deepEqual(await orders.reportProblem(id, NOTE, ADDRESS), { ok: false, reason: "not-delivered" })
  }
  const made = await order("made-up", { test: true })
  assert.deepEqual(await orders.reportProblem(made, NOTE, ADDRESS), { ok: false, reason: "not-delivered" })
})

test("the owner sees the report, answers it once, and the buyer reads the answer", async () => {
  const id = await order("reported-2")
  await orders.reportProblem(id, NOTE, ADDRESS)
  // Until it is answered the buyer can say it again, with another address.
  assert.deepEqual(await orders.reportProblem(id, `${NOTE} Tried twice.`, ADDRESS_2), { ok: true })

  const waiting = (await admin.listProblems()).find((problem) => problem.id === id)
  assert.equal(waiting?.note, `${NOTE} Tried twice.`)
  assert.equal(waiting?.refundAddress, ADDRESS_2)
  assert.equal(waiting?.receivedZat, 600_000)

  const view = await orders.readOrder(id)
  assert.equal(view?.problem?.answered, false)
  // The address is on the order's page shortened, as with any refund address.
  assert.ok(view?.refundTo && view.refundTo.length < ADDRESS_2.length)

  assert.equal((await admin.answerProblem(id, { refunded: true, reply: "x".repeat(301) })).ok, false)
  assert.deepEqual(await admin.answerProblem(id, { refunded: true, reply: " Sent today. " }), { ok: true })
  assert.ok(!(await admin.listProblems()).some((problem) => problem.id === id))

  const answered = (await orders.readOrder(id))?.problem
  assert.deepEqual({ ...answered, at: 0 }, { note: `${NOTE} Tried twice.`, at: 0, answered: true, reply: "Sent today.", refunded: true })

  // An answer is final: no second answer, and no new report on the same order.
  assert.equal((await admin.answerProblem(id, { refunded: false, reply: "" })).ok, false)
  assert.deepEqual(await orders.reportProblem(id, NOTE, ADDRESS), { ok: false, reason: "answered" })
  assert.equal((await admin.answerProblem("no-such-order", { refunded: false, reply: "" })).ok, false)
})

test("an answer without a refund and without a line says only that", async () => {
  const id = await order("reported-3")
  await orders.reportProblem(id, NOTE, ADDRESS)
  assert.deepEqual(await admin.answerProblem(id, { refunded: false, reply: "   " }), { ok: true })
  const answered = (await orders.readOrder(id))?.problem
  assert.equal(answered?.refunded, false)
  assert.equal(answered?.reply, null)
})

test("an old order with a report that has no answer is kept until it has one", async () => {
  const long = Date.now() - 30 * DAY
  const quiet = await order("old-quiet", { closedAt: long, deliveredAt: long })
  const open = await order("old-reported", { closedAt: long, deliveredAt: long })
  const closed = await order("old-answered", { closedAt: long, deliveredAt: long })
  await orders.reportProblem(open, NOTE, ADDRESS)
  await orders.reportProblem(closed, NOTE, ADDRESS)
  await admin.answerProblem(closed, { refunded: false, reply: "" })

  // Old orders are cleared out whenever a new one is placed.
  const keys = await seal.newOrderKeys()
  const placed = await orders.createOrder({ slug: "test-voucher", publicKey: keys.publicKey, wrappedKey: keys.wrappedKey })
  assert.ok(placed.ok)
  assert.equal(await row(quiet), undefined)
  assert.equal((await row(open))?.problem, NOTE)
  assert.equal(await row(closed), undefined)
})

test("an item with an eSIM's code in stock is on the eSIM shelf without being put there", async () => {
  await admin.createProduct({ slug: "plain-code", name: "Plain code", blurb: "", priceCents: 500 })
  await admin.createProduct({ slug: "esim-code", name: "eSIM code", blurb: "", priceCents: 500 })
  await admin.createProduct({ slug: "esim-moved", name: "eSIM moved", blurb: "", priceCents: 500, shelf: "vouchers" })
  const all = await admin.listProducts()
  const id = (slug: string) => all.find((product) => product.slug === slug)!.id
  await admin.addStock(id("plain-code"), "ABCD-EFGH")
  await admin.addStock(id("esim-code"), "LPA:1$rsp.example.invalid$CODE-1")
  await admin.addStock(id("esim-moved"), "LPA:1$rsp.example.invalid$CODE-2")
  for (const slug of ["plain-code", "esim-code", "esim-moved"]) {
    await admin.updateProduct(id(slug), { name: slug, blurb: "", priceCents: 500, active: true })
  }

  const shelf = async (slug: string) => (await orders.getItem(slug))?.shelf
  assert.equal(await shelf("plain-code"), null)
  assert.equal(await shelf("esim-code"), "esim")
  // What the owner chose stands.
  assert.equal(await shelf("esim-moved"), "vouchers")
})
