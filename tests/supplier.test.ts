import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// An item that is made when it is paid for: an eSIM bought from the supplier out of the owner's
// balance there, the moment the payment is three blocks deep. The supplier, the payment engine and
// the chain explorer are all played here; nothing is bought and no coin moves.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`
process.env.CIPHERPAY_URL = "http://engine.test:3080"
process.env.CIPHERPAY_API_KEY = "cpay_test_key"
process.env.CIPHERSCAN_API_URL = "http://scan.test"
process.env.PAYMENT_NETWORK = "mainnet"

const SUPPLIER = "https://api.esimaccess.com/api/v1/open"
const CODE = "access-code-for-tests"

// ---------------------------------------------------------------- the supplier, played here

// Prices and the balance are in ten-thousandths of a dollar, as the supplier counts.
let wholesale = 80_000
let balance = 500_000
let supplierAnswers = true
let refuse: string | null = null
let makesIt = true
const bought = new Map<string, { orderNo: string; packageCode: string }>()
const supplierCalls: { path: string; body: string; code: string | null }[] = []

// ---------------------------------------------------------------- the engine and the explorer

type Kept = { status: string; received: number; txid: string | null; priceZat: number }
const invoices = new Map<string, Kept>()
const depth = new Map<string, number>()
let serial = 0

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("kraken")) return json({ result: { XZECZUSD: { c: ["1000"] } } })
  if (url.includes("coinbase")) return json({ data: { amount: "1000" } })
  if (url.startsWith("http://scan.test")) {
    const txid = url.split("/api/tx/")[1]
    return depth.has(txid) ? json({ confirmations: depth.get(txid) }) : json({}, 404)
  }

  if (url.startsWith(SUPPLIER)) {
    const route = url.slice(SUPPLIER.length)
    const headers = new Headers(init?.headers)
    supplierCalls.push({ path: route, body: String(init?.body ?? ""), code: headers.get("RT-AccessCode") })
    if (!supplierAnswers) throw new Error("connection refused")
    if (route === "/package/list") {
      return json({ success: true, obj: { packageList: [{ packageCode: "CKH001", slug: "JP_5_30", price: wholesale, name: "Japan 5GB 30Days" }] } })
    }
    if (route === "/balance/query") return json({ success: true, errorCode: "0", obj: { balance } })
    if (route === "/esim/order") {
      const body = JSON.parse(String(init?.body)) as { transactionId: string; packageInfoList: { packageCode: string; count: number }[] }
      if (refuse) return json({ success: false, errorCode: refuse, errorMsg: "refused", obj: null })
      // A transaction id seen before is the same request: nothing is bought again.
      if (!bought.has(body.transactionId)) {
        balance -= wholesale
        bought.set(body.transactionId, { orderNo: `B${bought.size + 1}`, packageCode: body.packageInfoList[0].packageCode })
      }
      return json({ success: true, errorCode: null, obj: { orderNo: bought.get(body.transactionId)!.orderNo, transactionId: body.transactionId } })
    }
    if (route === "/esim/query") {
      const { orderNo } = JSON.parse(String(init?.body)) as { orderNo: string }
      if (!makesIt) return json({ success: false, errorCode: "200010", errorMsg: "still allocating", obj: null })
      return json({ success: true, errorCode: "0", obj: { esimList: [{ orderNo, ac: `LPA:1$rsp.example$CODE-FOR-${orderNo}`, qrCodeUrl: "https://p.qrsim.net/x.png" }] } })
    }
    return json({ success: false, errorCode: "000103" })
  }

  if (!url.startsWith("http://engine.test:3080")) throw new Error(`unexpected request: ${url}`)
  if (url.endsWith("/api/health")) return json({ status: "ok" })
  if (url.endsWith("/api/invoices") && init?.method === "POST") {
    const { amount } = JSON.parse(String(init.body)) as { amount: number }
    const id = `inv-${++serial}`
    invoices.set(id, { status: "pending", received: 0, txid: null, priceZat: Math.round((amount / 1000) * 1e8) })
    return json({ invoice_id: id, payment_address: `u1address${serial}`, price_zec: amount / 1000, zec_rate: 1000 }, 201)
  }
  const [, id, action] = /\/api\/invoices\/([^/]+)\/(status|cancel)$/.exec(url) ?? []
  const kept = invoices.get(id)
  if (!kept) return json({ error: "Invoice not found" }, 404)
  if (action === "cancel") return json({ ok: true })
  return json({ invoice_id: id, status: kept.status, detected_txid: kept.txid, received_zatoshis: kept.received, price_zatoshis: kept.priceZat })
}) as typeof fetch

// The payment of an order's whole amount, a number of blocks deep.
function paid(ref: string, blocks: number) {
  const kept = invoices.get(ref)!
  kept.received = kept.priceZat
  kept.txid = `tx-${ref}`
  kept.status = blocks > 0 ? "confirmed" : "detected"
  depth.set(kept.txid, blocks)
}

// ---------------------------------------------------------------- the shop

const MINUTE = 60_000
let clock = Date.UTC(2026, 9, 13)
const later = () => (clock += 3 * 60 * MINUTE)

let orders: typeof import("../lib/orders")
let admin: typeof import("../lib/admin")
let seal: typeof import("../lib/seal")
let supplier: typeof import("../lib/supplier")
let cipherpay: typeof import("../lib/cipherpay")
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>
let schema: typeof import("../lib/db").schema
let eq: typeof import("drizzle-orm").eq

before(async () => {
  orders = await import("../lib/orders")
  admin = await import("../lib/admin")
  seal = await import("../lib/seal")
  supplier = await import("../lib/supplier")
  cipherpay = await import("../lib/cipherpay")
  ;({ eq } = await import("drizzle-orm"))
  const database = await import("../lib/db")
  db = await database.getDb()
  schema = database.schema
  // A $10 eSIM that costs the owner $8.
  assert.deepEqual(await admin.createProduct({ slug: "esim-japan", name: "eSIM Japan 5 GB", blurb: "", priceCents: 1000, supplierRef: "JP_5_30" }), { ok: true })
  const [made] = await db.select().from(schema.products).where(eq(schema.products.slug, "esim-japan"))
  assert.equal(made.kind, "supplier")
  await db.update(schema.products).set({ active: true }).where(eq(schema.products.id, made.id))
})

beforeEach(() => {
  process.env.ESIMACCESS_CODE = CODE
  process.env.PAYMENT_NETWORK = "mainnet"
  wholesale = 80_000
  balance = 500_000
  supplierAnswers = true
  refuse = null
  makesIt = true
  supplierCalls.length = 0
  supplier.forgetSupplier()
  cipherpay.forgetHealth()
})

async function place(now: number) {
  const keys = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug: "esim-japan", publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
  return { keys, result }
}
async function placed(now: number) {
  const { keys, result } = await place(now)
  assert.ok(result.ok)
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, result.id))
  return { id: result.id, ref: row.engineRef!, keys }
}
const purchases = () => supplierCalls.filter((call) => call.path === "/esim/order")

test("an eSIM is bought when its order is paid, not before, and handed over sealed", async () => {
  const now = later()
  const { id, ref, keys } = await placed(now)
  assert.equal(purchases().length, 0, "nothing is bought for an order that is only placed")
  assert.equal(balance, 500_000)

  // Seen, and one block deep: still nothing is bought.
  paid(ref, 1)
  assert.equal((await orders.readOrder(id, now + 2 * MINUTE))?.state, "confirmed")
  assert.equal(purchases().length, 0)

  paid(ref, 3)
  const delivered = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(purchases().length, 1)
  assert.equal(balance, 420_000)
  const item = await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!)
  assert.match(item, /^LPA:1\$rsp\.example\$CODE-FOR-B\d+$/)

  // The readable code is nowhere in the shop's own records: no stock row, and the order holds ciphertext.
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id))
  assert.equal(row.stockId, null)
  assert.ok(!JSON.stringify(row).includes("CODE-FOR-"))
  assert.match(row.supplyRef!, /^B\d+$/)
})

test("the supplier is told the package and a hash, never the order's own id, and is asked with the key", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  paid(ref, 3)
  await orders.readOrder(id, now + 5 * MINUTE)

  const [purchase] = purchases()
  const sent = JSON.parse(purchase.body) as { transactionId: string; packageInfoList: unknown[] }
  assert.deepEqual(sent.packageInfoList, [{ packageCode: "JP_5_30", count: 1 }])
  assert.equal(sent.transactionId, await supplier.transactionId(id))
  assert.equal(purchase.code, CODE)
  assert.ok(!supplierCalls.some((call) => call.body.includes(id)), "the order's id opens its status page: it is not sent")
})

test("while the supplier is still making it the order waits, and it is bought once however often it is read", async () => {
  const now = later()
  const { id, ref, keys } = await placed(now)
  paid(ref, 3)
  makesIt = false

  const waiting = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(waiting?.state, "confirmed")
  assert.equal(waiting?.making, true)
  assert.equal(waiting?.sealed, null)
  for (let i = 1; i <= 4; i++) await orders.readOrder(id, now + (5 + i) * MINUTE)
  assert.equal(bought.size > 0 && balance === 420_000, true, "one purchase, whatever the number of looks")
  assert.equal(purchases().length, 1, "after the first look the supplier is only asked whether it is ready")

  makesIt = true
  const delivered = await orders.readOrder(id, now + 10 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.match(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), /^LPA:/)
})

test("a purchase whose answer was lost is not made twice", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  paid(ref, 3)
  // The supplier buys it, and the shop forgets the number it was given (a crash in between).
  await orders.readOrder(id, now + 5 * MINUTE)
  await db.update(schema.orders).set({ state: "confirmed", sealed: null, supplyRef: null, deliveredAt: null, closedAt: null }).where(eq(schema.orders.id, id))
  const before = balance

  const again = await orders.readOrder(id, now + 6 * MINUTE)
  assert.equal(again?.state, "delivered")
  assert.equal(balance, before, "the same transaction id is the same purchase")
})

test("an item is not sold when the supplier could not fill the order", async () => {
  // It costs the owner more than the shop asks for it.
  wholesale = 110_000
  assert.deepEqual((await place(later())).result, { ok: false, reason: "no-stock" })

  // The owner's balance there does not cover it.
  wholesale = 80_000
  balance = 50_000
  supplier.forgetSupplier()
  assert.deepEqual((await place(later())).result, { ok: false, reason: "no-stock" })

  // The supplier does not answer.
  balance = 500_000
  supplierAnswers = false
  supplier.forgetSupplier()
  assert.deepEqual((await place(later())).result, { ok: false, reason: "no-stock" })
  assert.equal(purchases().length, 0)
})

test("without the key to the supplier, or where only test orders are taken, the item is not on the shelf", async () => {
  const now = later()
  assert.ok((await orders.listItems(now)).some((item) => item.slug === "esim-japan" && item.left === null))

  delete process.env.ESIMACCESS_CODE
  assert.ok(!(await orders.listItems(now)).some((item) => item.slug === "esim-japan"))
  assert.deepEqual((await place(now)).result, { ok: false, reason: "no-stock" })

  process.env.ESIMACCESS_CODE = CODE
  delete process.env.PAYMENT_NETWORK
  assert.ok(!(await orders.listItems(now)).some((item) => item.slug === "esim-japan"))
  assert.deepEqual((await place(now)).result, { ok: false, reason: "no-product" })
})

test("paid, and the supplier refuses: nothing is bought and the payment is owed back", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  paid(ref, 3)
  refuse = "200007"
  const stuck = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(stuck?.state, "owed")
  assert.equal(stuck?.owedWhy, "no-item")
  assert.equal(stuck?.owedZat, stuck?.zat)
  assert.equal(stuck?.sealed, null)
  assert.ok((await admin.listRefundsDue(now + 6 * MINUTE)).some((entry) => entry.id === id))
})

test("paid, and the item never comes: after half an hour the payment is owed back", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  paid(ref, 3)
  makesIt = false
  assert.equal((await orders.readOrder(id, now + 5 * MINUTE))?.state, "confirmed")
  assert.equal((await orders.readOrder(id, now + 30 * MINUTE))?.state, "confirmed")
  const late = await orders.readOrder(id, now + 50 * MINUTE)
  assert.equal(late?.state, "owed")
  assert.equal(late?.owedZat, late?.zat)
})

test("a supplier that does not answer leaves a paid order waiting, not lost", async () => {
  const now = later()
  const { id, ref, keys } = await placed(now)
  paid(ref, 3)
  supplierAnswers = false
  const waiting = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(waiting?.state, "confirmed")
  assert.equal(waiting?.sealed, null)

  supplierAnswers = true
  const delivered = await orders.readOrder(id, now + 7 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.match(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), /^LPA:/)
})

test("such an item takes no uploaded codes", async () => {
  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "esim-japan"))
  assert.deepEqual(await admin.addStock(product.id, "SOME-CODE"), {
    ok: false,
    error: "This item is made by the supplier when it is paid for. It takes no stock.",
  })
})
