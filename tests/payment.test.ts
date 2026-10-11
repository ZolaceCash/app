import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// Real payments, against a stand-in for the payment engine's HTTP interface (CipherPay,
// lib/cipherpay.ts) and for the chain explorer it reads. No network is used and no coin moves:
// what is tested is what the shop does with each thing the engine can report.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

const ENGINE = "http://engine.test:3080"
const SCAN = "http://scan.test"
const KEY = "cpay_test_key"

// ---------------------------------------------------------------- the two services, played here

type Kept = { status: string; received: number; txid: string | null; priceZat: number; cancelled: boolean; extra: string[] }
const invoices = new Map<string, Kept>()
const depth = new Map<string, number>()
const asked: { url: string; method: string; body: string; key: string | null }[] = []
let prices: [number, number] = [1000, 1000]
let engineRate = 1000
let engineHealth: "ok" | "degraded" | "unhealthy" | "down" = "ok"
let engineAnswers = true
let addressPrefix = "u1"
let serial = 0

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? "GET"
  if (url.includes("kraken")) return json({ result: { XZECZUSD: { c: [String(prices[0])] } } })
  if (url.includes("coinbase")) return json({ data: { amount: String(prices[1]) } })

  if (url.startsWith(SCAN)) {
    const txid = url.split("/api/tx/")[1]
    return depth.has(txid) ? json({ txid, confirmations: depth.get(txid) }) : json({ error: "not found" }, 404)
  }

  if (!url.startsWith(ENGINE)) throw new Error(`unexpected request: ${url}`)
  const headers = new Headers(init?.headers)
  asked.push({ url, method, body: String(init?.body ?? ""), key: headers.get("authorization") })
  if (url.endsWith("/api/health")) {
    if (engineHealth === "down") throw new Error("connection refused")
    return json({ status: engineHealth, service: "cipherpay" }, engineHealth === "unhealthy" ? 503 : 200)
  }
  if (!engineAnswers) throw new Error("connection refused")

  if (url.endsWith("/api/invoices") && method === "POST") {
    const { amount } = JSON.parse(String(init?.body)) as { amount: number }
    const id = `inv-${++serial}`
    const priceZec = amount / engineRate
    invoices.set(id, { status: "pending", received: 0, txid: null, priceZat: Math.round(priceZec * 1e8), cancelled: false, extra: [] })
    return json({ invoice_id: id, payment_address: `${addressPrefix}address${serial}`, price_zec: priceZec, zec_rate: engineRate }, 201)
  }
  const [, id, action] = /\/api\/invoices\/([^/]+)\/(status|cancel)$/.exec(url) ?? []
  const kept = invoices.get(id)
  if (!kept) return json({ error: "Invoice not found" }, 404)
  if (action === "cancel") {
    kept.cancelled = true
    kept.status = "expired"
    return json({ ok: true })
  }
  return json({ invoice_id: id, status: kept.status, detected_txid: kept.txid, received_zatoshis: kept.received, price_zatoshis: kept.priceZat })
}) as typeof fetch

// What the engine would report after a payment of `zat` to an invoice, by its own rules: full
// from 99.5% of the price, otherwise underpaid, adding up while it is underpaid.
function pay(ref: string, zat: number, txid = `tx-${ref}-${zat}`) {
  const kept = invoices.get(ref)!
  if (kept.status === "pending" || kept.status === "underpaid") {
    kept.received = kept.status === "underpaid" ? kept.received + zat : zat
    kept.txid = txid
    kept.status = kept.received >= kept.priceZat * 0.995 ? "detected" : "underpaid"
  }
  // Paid already: the engine keeps its state and adds what came on top (it is patched to keep
  // watching a paid invoice: engine/cipherpay/). The same transaction is counted once.
  else if ((kept.status === "detected" || kept.status === "confirmed") && !kept.extra.includes(txid) && txid !== kept.txid) {
    kept.extra.push(txid)
    kept.received += zat
  }
}
function mine(ref: string, blocks: number) {
  const kept = invoices.get(ref)!
  if (kept.status === "detected" || kept.status === "confirmed") {
    kept.status = "confirmed"
    depth.set(kept.txid!, blocks)
  }
}

// ---------------------------------------------------------------- the shop

const MINUTE = 60_000
let clock = Date.UTC(2026, 9, 12)
const later = () => (clock += 3 * 60 * MINUTE)

let orders: typeof import("../lib/orders")
let admin: typeof import("../lib/admin")
let seal: typeof import("../lib/seal")
let cipherpay: typeof import("../lib/cipherpay")
let payment: typeof import("../lib/payment")
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>
let schema: typeof import("../lib/db").schema
let eq: typeof import("drizzle-orm").eq

function real(network: "mainnet" | "testnet" = "mainnet") {
  process.env.CIPHERPAY_URL = ENGINE
  process.env.CIPHERPAY_API_KEY = KEY
  process.env.CIPHERSCAN_API_URL = SCAN
  process.env.PAYMENT_NETWORK = network
  addressPrefix = network === "mainnet" ? "u1" : "utest1"
}

before(async () => {
  orders = await import("../lib/orders")
  admin = await import("../lib/admin")
  seal = await import("../lib/seal")
  cipherpay = await import("../lib/cipherpay")
  payment = await import("../lib/payment")
  ;({ eq } = await import("drizzle-orm"))
  const database = await import("../lib/db")
  db = await database.getDb()
  schema = database.schema
  await db.insert(schema.products).values({ slug: "voucher", name: "Voucher", blurb: "", priceCents: 1000, kind: "stock" })
})

beforeEach(() => {
  real()
  prices = [1000, 1000]
  engineRate = 1000
  engineHealth = "ok"
  engineAnswers = true
  asked.length = 0
  cipherpay.forgetHealth()
})

// One code on the shelf, and an order for it. $10 at $1000 a ZEC is 0.01 ZEC: 1,000,000 zatoshi.
const PRICE = 1_000_000
let codes = 0
async function shelve() {
  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "voucher"))
  // Whatever an earlier test left on the shelf is cleared, so each one starts with exactly one code.
  await db.delete(schema.stock).where(eq(schema.stock.state, "free"))
  const code = `CODE-${++codes}`
  await db.insert(schema.stock).values({ productId: product.id, payload: code })
  return code
}
async function place(now: number, slug = "voucher") {
  const keys = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug, publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
  return { keys, result }
}
// An order for the one code on the shelf. Which code it holds is read back, not assumed: an older
// order running out of time may have put its own code back just before.
async function placed(now: number) {
  await shelve()
  const { keys, result } = await place(now)
  assert.ok(result.ok)
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, result.id))
  const [held] = await db.select().from(schema.stock).where(eq(schema.stock.id, row.stockId!))
  return { id: result.id, ref: row.engineRef!, keys, code: held.payload!, stockId: held.id }
}
// Whether a code is for sale: by its row, or by its text.
const onShelf = async (code: number | string) =>
  (await db.select().from(schema.stock).where(eq(schema.stock.state, "free"))).some((row) => row.id === code || row.payload === code)
const owedIds = async (now: number) => (await admin.listRefundsDue(now)).map((entry) => entry.id)

// ---------------------------------------------------------------- which engine

test("without all three settings the shop takes test orders only", () => {
  for (const missing of ["CIPHERPAY_URL", "CIPHERPAY_API_KEY", "PAYMENT_NETWORK"]) {
    real()
    delete process.env[missing]
    assert.equal(payment.engine().network, "stand-in", missing)
  }
  real()
  process.env.PAYMENT_NETWORK = "main"
  assert.equal(payment.engine().network, "stand-in")
  real("testnet")
  assert.equal(payment.engine().network, "testnet")
  real()
  assert.equal(payment.engine().network, "mainnet")
})

test("the key to the engine can come from the file its registration leaves", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs")
  const file = path.join(mkdtempSync(path.join(tmpdir(), "zolace-key-")), "api_key")
  delete process.env.CIPHERPAY_API_KEY
  process.env.CIPHERPAY_API_KEY_FILE = file
  // Not written yet: the engine has not been given a viewing key, so test orders it is.
  assert.equal(payment.engine().network, "stand-in")

  // With the line end a shell would leave: it is not part of the key.
  writeFileSync(file, "cpay_from_file\n")
  assert.equal(payment.engine().network, "mainnet")
  await shelve()
  assert.ok((await place(later())).result.ok)
  assert.equal(asked.find((call) => call.url.endsWith("/api/invoices"))?.key, "Bearer cpay_from_file")
  delete process.env.CIPHERPAY_API_KEY_FILE
})

test("the depth of a payment is asked of the network's own explorer when none is named", async () => {
  delete process.env.CIPHERSCAN_API_URL
  const seen: string[] = []
  const played = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("cipherscan.app")) {
      seen.push(url)
      return new Response(JSON.stringify({ confirmations: 4 }))
    }
    return played(input, init)
  }) as typeof fetch
  try {
    const now = later()
    const { id, ref } = await placed(now)
    pay(ref, PRICE, "tx-depth")
    invoices.get(ref)!.status = "confirmed"
    assert.equal((await orders.readOrder(id, now + 5 * MINUTE))?.state, "delivered")
    assert.deepEqual(seen, ["https://api.mainnet.cipherscan.app/api/tx/tx-depth"])
  } finally {
    globalThis.fetch = played
  }
})

// ---------------------------------------------------------------- the straight road

test("the whole amount, in time: seen, confirmed, then handed over at three blocks", async () => {
  const now = later()
  const { id, ref, keys, code } = await placed(now)

  const waiting = await orders.readOrder(id, now + MINUTE)
  assert.equal(waiting?.state, "waiting")
  assert.equal(waiting?.zat, PRICE)
  assert.equal(waiting?.network, "mainnet")
  assert.equal(waiting?.test, false)
  assert.match(waiting!.address, /^u1/)

  pay(ref, PRICE)
  const seen = await orders.readOrder(id, now + 2 * MINUTE)
  assert.equal(seen?.state, "seen")
  assert.equal(seen?.confirmations, 0)
  assert.equal(seen?.receivedZat, PRICE)

  mine(ref, 1)
  const inBlock = await orders.readOrder(id, now + 3 * MINUTE)
  assert.equal(inBlock?.state, "confirmed")
  assert.equal(inBlock?.confirmations, 1)
  assert.equal(inBlock?.sealed, null)

  mine(ref, 2)
  assert.equal((await orders.readOrder(id, now + 4 * MINUTE))?.sealed, null)

  mine(ref, 3)
  const delivered = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, 0)
  assert.equal(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), code)
  assert.ok(!(await owedIds(now + 6 * MINUTE)).includes(id))
})

test("the engine is told the amount and nothing else, and is asked with the key", async () => {
  const now = later()
  const { id } = await placed(now)
  const made = asked.find((call) => call.method === "POST" && call.url.endsWith("/api/invoices"))
  assert.deepEqual(JSON.parse(made!.body), { amount: 10, currency: "USD" })
  assert.equal(made!.key, `Bearer ${KEY}`)
  assert.ok(!asked.some((call) => call.url.includes(id) || call.body.includes(id)), "the order's own name is not sent")
})

test("a payment seen in time is honoured even if nobody looked until after the lock", async () => {
  const now = later()
  const { id, ref, keys, code } = await placed(now)
  pay(ref, PRICE)
  mine(ref, 5)
  // The buyer paid at minute 5 and closed the page. The next look is forty minutes on.
  const delivered = await orders.readOrder(id, now + 40 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), code)
})

test("without an answer from the explorer a confirmed payment counts as one block and waits", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  pay(ref, PRICE)
  invoices.get(ref)!.status = "confirmed"
  const waiting = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(waiting?.state, "confirmed")
  assert.equal(waiting?.confirmations, 1)
  assert.equal(waiting?.sealed, null)
})

// ---------------------------------------------------------------- too little

test("too little, then the rest in time: handed over", async () => {
  const now = later()
  const { id, ref, keys, code } = await placed(now)

  pay(ref, 400_000, "tx-part-1")
  const part = await orders.readOrder(id, now + 2 * MINUTE)
  assert.equal(part?.state, "underpaid")
  assert.equal(part?.receivedZat, 400_000)
  assert.equal(part?.sealed, null)

  pay(ref, 600_000, "tx-part-2")
  mine(ref, 3)
  const delivered = await orders.readOrder(id, now + 6 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, 0)
  assert.equal(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), code)
})

test("too little when the lock runs out: nothing is handed over and what came is owed back", async () => {
  const now = later()
  const { id, ref, stockId } = await placed(now)
  pay(ref, 400_000)
  assert.equal((await orders.readOrder(id, now + 5 * MINUTE))?.state, "underpaid")
  assert.equal(await onShelf(stockId), false)

  const closed = await orders.readOrder(id, now + 16 * MINUTE)
  assert.equal(closed?.state, "owed")
  assert.equal(closed?.owedZat, 400_000)
  assert.equal(closed?.owedWhy, "short")
  assert.equal(closed?.sealed, null)
  // The code is for sale again.
  assert.equal(await onShelf(stockId), true)

  const queue = await admin.listRefundsDue(now + 17 * MINUTE)
  assert.equal(queue.find((entry) => entry.id === id)?.owedZat, 400_000)
  assert.equal(await admin.markRefunded(id, now + 20 * MINUTE), true)
  assert.equal((await orders.readOrder(id, now + 21 * MINUTE))?.state, "refunded")
  assert.ok(!(await owedIds(now + 22 * MINUTE)).includes(id))
  assert.equal(await admin.markRefunded(id, now + 23 * MINUTE), false)
})

// ---------------------------------------------------------------- too much

test("too much: the item is handed over and only the excess is owed back", async () => {
  const now = later()
  const { id, ref, keys, code } = await placed(now)
  pay(ref, PRICE + 250_000)
  mine(ref, 3)
  const delivered = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, 250_000)
  assert.equal(delivered?.owedWhy, "excess")
  assert.equal(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), code)

  assert.ok((await owedIds(now + 6 * MINUTE)).includes(id))
  assert.equal(await admin.markRefunded(id, now + 7 * MINUTE), true)
  // It was delivered, and stays delivered: the buyer keeps the item.
  const after = await orders.readOrder(id, now + 8 * MINUTE)
  assert.equal(after?.state, "delivered")
  assert.equal(after?.refunded, true)
  assert.ok(!(await owedIds(now + 9 * MINUTE)).includes(id))
})

test("an excess smaller than the network's fee is not owed: it could not be sent back", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  pay(ref, PRICE + payment.FEE_ZAT)
  mine(ref, 3)
  const delivered = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, 0)
})

// ---------------------------------------------------------------- too late

test("too late: the order expired, the code went back, and the payment is owed back", async () => {
  const now = later()
  const { id, ref, stockId } = await placed(now)
  const expired = await orders.readOrder(id, now + 16 * MINUTE)
  assert.equal(expired?.state, "expired")
  assert.equal(await onShelf(stockId), true)

  // The engine still watches the invoice (its own hour), and reports the late payment.
  pay(ref, PRICE)
  mine(ref, 2)
  const late = await orders.readOrder(id, now + 25 * MINUTE)
  assert.equal(late?.state, "owed")
  assert.equal(late?.owedZat, PRICE)
  assert.equal(late?.owedWhy, "late")
  assert.equal(late?.sealed, null)
  assert.ok((await owedIds(now + 26 * MINUTE)).includes(id))
})

test("a late payment nobody looked at still reaches the refund queue", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  await orders.readOrder(id, now + 16 * MINUTE)
  pay(ref, PRICE)
  // No order page is open. The owner opens the refunds screen.
  assert.ok((await owedIds(now + 30 * MINUTE)).includes(id))
})

test("a payment that comes days late is still found and owed back", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  assert.equal((await orders.readOrder(id, now + 16 * MINUTE))?.state, "expired")

  const DAY = 24 * 60 * MINUTE
  pay(ref, PRICE)
  const late = await orders.readOrder(id, now + 2 * DAY)
  assert.equal(late?.state, "owed")
  assert.equal(late?.owedZat, PRICE)
  assert.equal(late?.owedWhy, "late")
})

test("when the watch is over, the order is no longer asked about", async () => {
  const now = later()
  const { id } = await placed(now)
  await orders.readOrder(id, now + 16 * MINUTE)
  assert.equal(orders.watchMs(), 7 * 24 * 60 * MINUTE)
  asked.length = 0
  assert.equal((await orders.readOrder(id, now + 8 * 24 * 60 * MINUTE))?.state, "expired")
  assert.deepEqual(asked.filter((call) => call.url.includes("/status")), [])

  // The watch never outlasts the order itself: it is deleted after ORDER_RETENTION_DAYS (7 here).
  process.env.PAYMENT_WATCH_HOURS = String(30 * 24)
  assert.equal(orders.watchMs(), 7 * 24 * 60 * MINUTE)
  process.env.PAYMENT_WATCH_HOURS = "2"
  assert.equal(orders.watchMs(), 2 * 60 * MINUTE)
  delete process.env.PAYMENT_WATCH_HOURS
})

// ---------------------------------------------------------------- twice

test("paid twice: handed over once, and the second payment is owed back", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  pay(ref, PRICE, "tx-first")
  mine(ref, 3)
  const delivered = await orders.readOrder(id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, 0)

  // The buyer's wallet sent it again. Nobody opens the order; the owner opens the refunds screen.
  pay(ref, PRICE, "tx-second")
  const queue = await admin.listRefundsDue(now + 30 * MINUTE)
  assert.equal(queue.find((entry) => entry.id === id)?.owedZat, PRICE)

  const again = await orders.readOrder(id, now + 31 * MINUTE)
  assert.equal(again?.state, "delivered")
  assert.equal(again?.receivedZat, 2 * PRICE)
  assert.equal(again?.owedWhy, "excess")
  // One code went out, not two.
  assert.equal((await db.select().from(schema.stock)).filter((row) => row.orderId === id).length, 1)

  // The same report again changes nothing, and once it is refunded the order is left alone.
  assert.equal((await orders.readOrder(id, now + 32 * MINUTE))?.owedZat, PRICE)
  assert.equal(await admin.markRefunded(id, now + 33 * MINUTE), true)
  pay(ref, PRICE, "tx-third")
  assert.ok(!(await owedIds(now + 34 * MINUTE)).includes(id))
})

// ---------------------------------------------------------------- when the engine is not to be trusted

test("no order is started while the engine is unhealthy or does not answer", async () => {
  const code = await shelve()
  for (const state of ["unhealthy", "down"] as const) {
    engineHealth = state
    cipherpay.forgetHealth()
    assert.deepEqual((await place(later())).result, { ok: false, reason: "no-engine" }, state)
  }
  assert.ok(!asked.some((call) => call.url.endsWith("/api/invoices")), "no invoice was asked for")
  assert.equal(await onShelf(code), true)

  // Catching up by a few blocks is not a reason to stop.
  engineHealth = "degraded"
  cipherpay.forgetHealth()
  assert.ok((await place(later())).result.ok)
})

test("no order is started when the engine's price is more than 2% from the shop's two sources", async () => {
  const code = await shelve()
  engineRate = 1030
  assert.deepEqual((await place(later())).result, { ok: false, reason: "price-disagree" })
  // The invoice the engine made is cancelled, and the code is still on the shelf.
  assert.ok([...invoices.values()].at(-1)!.cancelled)
  assert.equal(await onShelf(code), true)

  engineRate = 1015
  const { result } = await place(later())
  assert.ok(result.ok)
  // The buyer pays what the engine will look for: its own amount, not the shop's.
  assert.equal((await orders.readOrder(result.id, clock + MINUTE))?.zat, Math.round((10 / 1015) * 1e8))
})

test("an engine on the other network is refused before any order is made", async () => {
  const code = await shelve()
  real("mainnet")
  addressPrefix = "utest1"
  assert.deepEqual((await place(later())).result, { ok: false, reason: "no-engine" })
  assert.ok([...invoices.values()].at(-1)!.cancelled)
  assert.equal(await onShelf(code), true)
})

test("an order is not closed while the engine does not answer: the code is not sold twice", async () => {
  const now = later()
  const { id, ref, keys, code, stockId } = await placed(now)
  pay(ref, PRICE)
  mine(ref, 3)

  engineAnswers = false
  const unknown = await orders.readOrder(id, now + 20 * MINUTE)
  assert.equal(unknown?.state, "waiting")
  assert.equal(await onShelf(stockId), false)

  engineAnswers = true
  const delivered = await orders.readOrder(id, now + 22 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(await seal.openSealed(keys.secret, delivered!.wrappedKey, delivered!.sealed!), code)
})

// ---------------------------------------------------------------- what is for sale

test("a made-up item is not sold for real money, and is not shown where it is", async () => {
  const now = later()
  real("mainnet")
  assert.deepEqual((await place(now, "test-licence")).result, { ok: false, reason: "no-product" })
  assert.ok(!(await orders.listItems(now)).some((item) => item.kind === "test"))

  real("testnet")
  assert.ok((await orders.listItems(now)).some((item) => item.kind === "test"))
  const { result } = await place(now + MINUTE, "test-licence")
  assert.ok(result.ok)
  const order = await orders.readOrder(result.id, now + 2 * MINUTE)
  assert.equal(order?.network, "testnet")
  assert.equal(order?.test, false)
})

test("an order that is owed a refund is kept until the refund is sent, however old", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  pay(ref, 400_000)
  await orders.readOrder(id, now + 16 * MINUTE)

  // A month on, another order is placed: that is when old orders are cleared out.
  const month = now + 30 * 24 * 60 * MINUTE
  await shelve()
  assert.ok((await place(month)).result.ok)
  assert.equal((await orders.readOrder(id, month + MINUTE))?.state, "owed")
})

// ---------------------------------------------------------------- where a refund goes

// Two real unified addresses of Zcash's test network (the payment engine's, and a public faucet's).
const TEST_UA = "utest1eyxyvdjxyc20xyf66rttcsxgmhtt8xewaaylfg5tn5v57h57nsvcmk9jy3qfszxjjg298dwpk0fjwc2e2h576sq7gmshhgyrzc05wcr0"
const TEST_UA_2 = "utest1pmslle44wr0egglc2ec6dxglu6k3qmca2xkrmpcfr8hl5kqpkt9mwxy5lu00qut7xke3sudxtckm5l0x7f2yk3403peep4hppykhh5jn"

// An address with a checksum that holds, made here the way a wallet makes one: for the prefixes
// no real example is at hand for. `kind` is 1 for Bech32 and 0x2bc830a3 for Bech32m.
function addressWith(prefix: string, kind: number, length = 60) {
  const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  const polymod = (values: number[]) => {
    let check = 1
    for (const value of values) {
      const top = check >>> 25
      check = ((check & 0x1ffffff) << 5) ^ value
      for (let bit = 0; bit < 5; bit++) if ((top >>> bit) & 1) check ^= generator[bit]
    }
    return check >>> 0
  }
  const expanded = [...[...prefix].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...prefix].map((c) => c.charCodeAt(0) & 31)]
  const data = Array.from({ length }, (_, at) => (at * 7 + prefix.length) % 32)
  const mod = (polymod([...expanded, ...data, 0, 0, 0, 0, 0, 0]) ^ kind) >>> 0
  const checksum = Array.from({ length: 6 }, (_, at) => (mod >>> (5 * (5 - at))) & 31)
  return `${prefix}1${[...data, ...checksum].map((value) => charset[value]).join("")}`
}

test("a refund address is a shielded address of the order's network, with every character right", async () => {
  const { shieldedAddress, maskAddress } = await import("../lib/zcash-address")
  assert.equal(shieldedAddress(TEST_UA, "testnet"), TEST_UA)
  assert.equal(shieldedAddress(`  ${TEST_UA_2}\n`, "testnet"), TEST_UA_2)
  assert.equal(shieldedAddress(TEST_UA.toUpperCase(), "testnet"), TEST_UA)
  // The other network's address is not this network's.
  assert.equal(shieldedAddress(TEST_UA, "mainnet"), null)

  // One character typed wrong, anywhere, and the checksum no longer holds.
  for (const at of [8, 40, TEST_UA.length - 1]) {
    const wrong = TEST_UA.slice(0, at) + (TEST_UA[at] === "q" ? "p" : "q") + TEST_UA.slice(at + 1)
    assert.equal(shieldedAddress(wrong, "testnet"), null, `position ${at}`)
  }
  assert.equal(shieldedAddress(TEST_UA.slice(0, -1), "testnet"), null)
  assert.equal(shieldedAddress("Utest1" + TEST_UA.slice(6), "testnet"), null, "capitals and small letters mixed")

  const unified = addressWith("u", 0x2bc830a3, 120)
  const sapling = addressWith("zs", 1, 63)
  assert.equal(shieldedAddress(unified, "mainnet"), unified)
  assert.equal(shieldedAddress(sapling, "mainnet"), sapling)
  assert.equal(shieldedAddress(unified, "testnet"), null)
  // The right prefix with the other kind of checksum is not an address.
  assert.equal(shieldedAddress(addressWith("u", 1, 120), "mainnet"), null)
  assert.equal(shieldedAddress(addressWith("zs", 0x2bc830a3, 63), "mainnet"), null)
  // A transparent address would put the refund in public: not taken. Nor is anything else.
  assert.equal(shieldedAddress("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs", "mainnet"), null)
  assert.equal(shieldedAddress(addressWith("bc", 1, 40), "mainnet"), null)
  assert.equal(shieldedAddress("", "mainnet"), null)

  assert.equal(maskAddress(TEST_UA), "utest1ey…05wcr0")
})

test("the buyer of an order that is owed a refund says where to send it, and the owner sees it", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  const first = addressWith("u", 0x2bc830a3, 120)
  const second = addressWith("zs", 1, 63)

  // Nothing is owed yet: there is nothing to give an address for.
  assert.deepEqual(await orders.setRefundAddress(id, first), { ok: false, reason: "nothing-owed" })

  pay(ref, 400_000)
  await orders.readOrder(id, now + 16 * MINUTE)
  assert.equal((await orders.readOrder(id, now + 17 * MINUTE))?.refundTo, null)

  // A mistyped address, and one of the test network, are refused: the refund could not be called back.
  assert.deepEqual(await orders.setRefundAddress(id, first.slice(0, -1) + (first.endsWith("q") ? "p" : "q")), { ok: false, reason: "bad-address" })
  assert.deepEqual(await orders.setRefundAddress(id, TEST_UA), { ok: false, reason: "bad-address" })

  const kept = await orders.setRefundAddress(id, first)
  assert.deepEqual(kept, { ok: true, refundTo: `${first.slice(0, 8)}…${first.slice(-6)}` })
  // The order's page shows it shortened; the whole of it is for the owner alone.
  const page = await orders.readOrder(id, now + 18 * MINUTE)
  assert.equal(page?.refundTo, `${first.slice(0, 8)}…${first.slice(-6)}`)
  assert.ok(!JSON.stringify(page).includes(first))
  assert.equal((await admin.listRefundsDue(now + 19 * MINUTE)).find((entry) => entry.id === id)?.refundAddress, first)

  // Another address replaces it, until the refund is sent.
  assert.ok((await orders.setRefundAddress(id, second)).ok)
  assert.equal((await admin.listRefundsDue(now + 20 * MINUTE)).find((entry) => entry.id === id)?.refundAddress, second)
  assert.equal(await admin.markRefunded(id, now + 21 * MINUTE), true)
  assert.deepEqual(await orders.setRefundAddress(id, first), { ok: false, reason: "nothing-owed" })

  assert.deepEqual(await orders.setRefundAddress("no-such-order", first), { ok: false, reason: "no-order" })
})

test("an overpaid order that was handed over takes an address for its excess too", async () => {
  const now = later()
  const { id, ref } = await placed(now)
  pay(ref, PRICE + 300_000)
  mine(ref, 3)
  assert.equal((await orders.readOrder(id, now + 5 * MINUTE))?.owedZat, 300_000)
  assert.ok((await orders.setRefundAddress(id, addressWith("u", 0x2bc830a3, 120))).ok)
})
