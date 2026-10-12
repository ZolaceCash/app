import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// Other sellers, against a stand-in for the payment engine's HTTP interface. No network is used
// and no coin moves. What is tested: who can sign up and list, that an order of a seller's item
// is opened with that seller's key to the engine and with no other, that what such an order owes
// is the seller's and never on the owner's queue, and that one seller cannot touch another's.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

const ENGINE = "http://engine.test:3080"
const SCAN = "http://scan.test"
const SHOP_KEY = "cpay_shop_key"

// ---------------------------------------------------------------- a viewing key that passes the checksum

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
function polymod(values: number[]) {
  let check = 1
  for (const value of values) {
    const top = check >>> 25
    check = ((check & 0x1ffffff) << 5) ^ value
    for (let bit = 0; bit < 5; bit++) if ((top >>> bit) & 1) check ^= GENERATOR[bit]
  }
  return check >>> 0
}
// Any text of the right alphabet under a prefix, closed with the checksum unified keys use.
function keyLike(prefix: string, seed: number) {
  const data = Array.from({ length: 300 }, (_, index) => (index * 7 + seed * 13 + ((index * seed) % 5)) % 32)
  const expand = [...[...prefix].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...prefix].map((c) => c.charCodeAt(0) & 31)]
  const mod = polymod([...expand, ...data, 0, 0, 0, 0, 0, 0]) ^ 0x2bc830a3
  const checksum = Array.from({ length: 6 }, (_, index) => (mod >>> (5 * (5 - index))) & 31)
  return `${prefix}1${[...data, ...checksum].map((value) => CHARSET[value]).join("")}`
}

// ---------------------------------------------------------------- the engine, played here

type Kept = { status: string; received: number; txid: string | null; priceZat: number; merchant: string; extra: string[] }
const invoices = new Map<string, Kept>()
const merchants = new Map<string, string>() // viewing key -> the engine's key for it
const depth = new Map<string, number>()
const asked: { url: string; method: string; body: string; key: string | null }[] = []
let registering: "ok" | "busy" | "down" = "ok"
let serial = 0

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? "GET"
  if (url.includes("kraken")) return json({ result: { XZECZUSD: { c: ["1000"] } } })
  if (url.includes("coinbase")) return json({ data: { amount: "1000" } })
  if (url.startsWith(SCAN)) {
    const txid = url.split("/api/tx/")[1]
    return depth.has(txid) ? json({ txid, confirmations: depth.get(txid) }) : json({ error: "not found" }, 404)
  }
  if (!url.startsWith(ENGINE)) throw new Error(`unexpected request: ${url}`)
  const key = new Headers(init?.headers).get("authorization")
  asked.push({ url, method, body: String(init?.body ?? ""), key })
  if (url.endsWith("/api/health")) return json({ status: "ok" })

  if (url.endsWith("/api/merchants") && method === "POST") {
    if (registering === "down") throw new Error("connection refused")
    if (registering === "busy") return new Response("Too many requests", { status: 429 })
    const { ufvk } = JSON.parse(String(init?.body)) as { ufvk: string }
    if (merchants.has(ufvk)) return json({ error: "A merchant with this viewing key is already registered" }, 409)
    const made = `cpay_sk_seller_${merchants.size + 1}`
    merchants.set(ufvk, made)
    return json({ merchant_id: `m-${merchants.size}`, api_key: made, dashboard_token: "dash", webhook_secret: "whsec" }, 201)
  }

  if (url.endsWith("/api/invoices") && method === "POST") {
    const { amount } = JSON.parse(String(init?.body)) as { amount: number }
    const id = `inv-${++serial}`
    const priceZec = amount / 1000
    const merchant = (key ?? "").replace("Bearer ", "")
    invoices.set(id, { status: "pending", received: 0, txid: null, priceZat: Math.round(priceZec * 1e8), merchant, extra: [] })
    // The address says whose viewing key it was made from, so a test can read where the money goes.
    return json({ invoice_id: id, payment_address: `u1from-${merchant}-${serial}`, price_zec: priceZec, zec_rate: 1000 }, 201)
  }
  const [, id, action] = /\/api\/invoices\/([^/]+)\/(status|cancel)$/.exec(url) ?? []
  const kept = invoices.get(id)
  if (!kept) return json({ error: "Invoice not found" }, 404)
  if (action === "cancel") return json({ ok: true })
  return json({ invoice_id: id, status: kept.status, detected_txid: kept.txid, received_zatoshis: kept.received, price_zatoshis: kept.priceZat })
}) as typeof fetch

function pay(ref: string, zat: number, txid = `tx-${ref}-${zat}`) {
  const kept = invoices.get(ref)!
  if (kept.status === "pending" || kept.status === "underpaid") {
    kept.received = kept.status === "underpaid" ? kept.received + zat : zat
    kept.txid = txid
    kept.status = kept.received >= kept.priceZat * 0.995 ? "detected" : "underpaid"
  } else if (!kept.extra.includes(txid) && txid !== kept.txid) {
    kept.extra.push(txid)
    kept.received += zat
  }
}
function mine(ref: string, blocks: number) {
  const kept = invoices.get(ref)!
  kept.status = "confirmed"
  depth.set(kept.txid!, blocks)
}

// ---------------------------------------------------------------- the shop

const MINUTE = 60_000
let clock = Date.UTC(2026, 9, 13)
const later = () => (clock += 3 * 60 * MINUTE)

let orders: typeof import("../lib/orders")
let admin: typeof import("../lib/admin")
let sellers: typeof import("../lib/sellers")
let selling: typeof import("../lib/selling")
let seal: typeof import("../lib/seal")
let cipherpay: typeof import("../lib/cipherpay")
let db: Awaited<ReturnType<typeof import("../lib/db").getDb>>
let schema: typeof import("../lib/db").schema
let eq: typeof import("drizzle-orm").eq

function real(network: "mainnet" | "testnet" = "mainnet") {
  process.env.CIPHERPAY_URL = ENGINE
  process.env.CIPHERPAY_API_KEY = SHOP_KEY
  process.env.CIPHERSCAN_API_URL = SCAN
  process.env.PAYMENT_NETWORK = network
}

before(async () => {
  orders = await import("../lib/orders")
  admin = await import("../lib/admin")
  sellers = await import("../lib/sellers")
  selling = await import("../lib/selling")
  seal = await import("../lib/seal")
  cipherpay = await import("../lib/cipherpay")
  ;({ eq } = await import("drizzle-orm"))
  const database = await import("../lib/db")
  db = await database.getDb()
  schema = database.schema
})

beforeEach(() => {
  real()
  process.env.SELLING = "open"
  delete process.env.SELLER_MAX_PRICE
  delete process.env.SELLER_MAX_ITEMS
  delete process.env.SELLERS_MAX
  registering = "ok"
  asked.length = 0
  cipherpay.forgetHealth()
})

let keys = 0
// A seller who signed up, with the secret of their link.
async function seller(name = `Seller ${keys + 1}`) {
  const viewing = keyLike("uview", ++keys)
  const joined = await sellers.join({ name, viewingKey: viewing, agreed: true }, clock)
  assert.ok(joined.ok, JSON.stringify(joined))
  const row = await sellers.sellerOf(joined.token)
  assert.ok(row)
  return { row, token: joined.token, viewing, engineKey: merchants.get(viewing)! }
}
// One item of theirs on the shelf, with the codes given.
async function listed(who: Awaited<ReturnType<typeof seller>>, codes: string[], price = "10") {
  assert.deepEqual(await sellers.addItem(who.row, { name: "Game key", blurb: "A key.", price, shelf: "licences" }), { ok: true })
  const item = (await sellers.desk(who.row, clock)).items.at(-1)!
  if (codes.length > 0) assert.ok((await sellers.addCodes(who.row, item.id, codes.join("\n"))).ok)
  assert.deepEqual(await sellers.saveItem(who.row, item.id, { name: item.name, blurb: item.blurb, price, shelf: "licences", active: true }), { ok: true })
  return item
}
async function order(slug: string, now: number) {
  const made = await seal.newOrderKeys()
  const result = await orders.createOrder({ slug, publicKey: made.publicKey, wrappedKey: made.wrappedKey, now })
  return { made, result }
}
const rowOf = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0]

// $10 at $1000 a ZEC: 1,000,000 zatoshi.
const PRICE = 1_000_000

// ---------------------------------------------------------------- when selling is open

test("selling is open only where the server says so and real payments run", async () => {
  assert.equal(selling.sellingOn(), true)
  delete process.env.SELLING
  assert.equal(selling.sellingOn(), false)
  assert.deepEqual(await sellers.join({ name: "Somebody", viewingKey: keyLike("uview", 900), agreed: true }), { ok: false, reason: "closed" })

  process.env.SELLING = "open"
  delete process.env.CIPHERPAY_URL
  assert.equal(selling.sellingOn(), false)
  assert.deepEqual(await sellers.join({ name: "Somebody", viewingKey: keyLike("uview", 900), agreed: true }), { ok: false, reason: "closed" })
  // Nothing was sent to the engine on the way.
  assert.equal(asked.filter((call) => call.url.endsWith("/api/merchants")).length, 0)
})

// ---------------------------------------------------------------- signing up

test("a seller signs up with a name, a viewing key and a yes to the rules", async () => {
  const good = keyLike("uview", 901)
  const ask = (name: string, viewingKey: string, agreed = true) => sellers.join({ name, viewingKey, agreed }, clock)

  assert.deepEqual(await ask("A", good), { ok: false, reason: "bad-name" })
  assert.deepEqual(await ask("Zolace", good), { ok: false, reason: "bad-name" })
  assert.deepEqual(await ask("Z-o-l-a-c-e Official", good), { ok: false, reason: "bad-name" })
  assert.deepEqual(await ask("<script>", good), { ok: false, reason: "bad-name" })
  assert.deepEqual(await ask("Key Corner", good, false), { ok: false, reason: "not-agreed" })

  // A key of the test network, a key with one character wrong, and things that are not viewing keys.
  assert.deepEqual(await ask("Key Corner", keyLike("uviewtest", 901)), { ok: false, reason: "bad-key" })
  assert.deepEqual(await ask("Key Corner", good.slice(0, 50) + (good[50] === "q" ? "p" : "q") + good.slice(51)), { ok: false, reason: "bad-key" })
  assert.deepEqual(await ask("Key Corner", keyLike("secret-extended-key-main", 901)), { ok: false, reason: "bad-key" })
  assert.deepEqual(await ask("Key Corner", "abandon ability able about above absent absorb abstract absurd abuse access accident"), { ok: false, reason: "bad-key" })
  // None of those reached the engine.
  assert.equal(asked.filter((call) => call.url.endsWith("/api/merchants")).length, 0)

  const joined = await ask("Key Corner", ` ${good.slice(0, 80)}\n${good.slice(80)} `)
  assert.ok(joined.ok)
  // The engine was sent the viewing key and nothing else about the seller.
  const [sent] = asked.filter((call) => call.url.endsWith("/api/merchants"))
  assert.deepEqual(JSON.parse(sent.body), { ufvk: good })
  assert.equal(sent.key, null)

  // What is kept: a hash of the secret, the engine's key. Not the secret, not the viewing key.
  const kept = JSON.stringify(await db.select().from(schema.sellers))
  assert.ok(!kept.includes(joined.token))
  assert.ok(!kept.includes(good))
  assert.ok(kept.includes(merchants.get(good)!))

  assert.equal((await sellers.sellerOf(joined.token))?.name, "Key Corner")
  assert.equal(await sellers.sellerOf(joined.token.slice(0, -1) + (joined.token.endsWith("A") ? "B" : "A")), null)
  assert.equal(await sellers.sellerOf(""), null)

  // The same viewing key a second time: the engine has it, and no second seller is made.
  assert.deepEqual(await ask("Key Corner Two", good), { ok: false, reason: "taken" })
})

test("signing up says so when the engine is busy, silent or the shop is full", async () => {
  registering = "busy"
  assert.deepEqual(await sellers.join({ name: "Late Comer", viewingKey: keyLike("uview", 902), agreed: true }), { ok: false, reason: "busy" })
  registering = "down"
  assert.deepEqual(await sellers.join({ name: "Late Comer", viewingKey: keyLike("uview", 902), agreed: true }), { ok: false, reason: "unavailable" })
  registering = "ok"
  process.env.SELLERS_MAX = "1"
  assert.deepEqual(await sellers.join({ name: "Late Comer", viewingKey: keyLike("uview", 902), agreed: true }), { ok: false, reason: "full" })
  assert.equal((await db.select().from(schema.sellers)).filter((row) => row.name === "Late Comer").length, 0)
})

// ---------------------------------------------------------------- items and codes

test("a seller lists items within the owner's limits, and only their own", async () => {
  const one = await seller()
  const two = await seller()
  const item = { name: "  Game   key ", blurb: "Works worldwide.", shelf: "licences" }

  assert.equal((await sellers.addItem(one.row, { ...item, price: "100.01" })).ok, false)
  assert.equal((await sellers.addItem(one.row, { ...item, price: "0" })).ok, false)
  assert.equal((await sellers.addItem(one.row, { ...item, price: "ten" })).ok, false)
  assert.equal((await sellers.addItem(one.row, { ...item, price: "10", shelf: "weapons" })).ok, false)
  assert.equal((await sellers.addItem(one.row, { ...item, name: "", price: "10" })).ok, false)
  assert.deepEqual(await sellers.addItem(one.row, { ...item, price: "$100" }), { ok: true })

  const [made] = (await sellers.desk(one.row, clock)).items
  assert.equal(made.name, "Game key")
  assert.equal(made.priceCents, 10000)
  assert.equal(made.active, false)
  assert.match(made.slug, /^game-key-[0-9a-f]{8}$/)
  // Off the shelf until its seller puts it there.
  assert.equal(await orders.getItem(made.slug, clock), null)

  // Another seller cannot change it or put codes behind it.
  assert.equal((await sellers.saveItem(two.row, made.id, { ...item, price: "1", active: true })).ok, false)
  assert.equal((await sellers.addCodes(two.row, made.id, "THEIRS")).ok, false)
  assert.equal((await sellers.clearCodes(two.row, made.id)).ok, false)
  assert.equal((await sellers.desk(two.row, clock)).items.length, 0)
  // Neither can the owner's item screen: a seller's item is the seller's.
  assert.equal((await admin.updateProduct(made.id, { name: "Changed", blurb: "", priceCents: 1, active: true })).ok, false)
  assert.equal((await admin.addStock(made.id, "OWNERS")).ok, false)
  assert.ok(!(await admin.listProducts()).some((row) => row.id === made.id))

  process.env.SELLER_MAX_ITEMS = "2"
  assert.deepEqual(await sellers.addItem(one.row, { ...item, price: "5" }), { ok: true })
  assert.equal((await sellers.addItem(one.row, { ...item, price: "5" })).ok, false)
  // Two items of the same name have two links.
  const slugs = (await sellers.desk(one.row, clock)).items.map((row) => row.slug)
  assert.equal(new Set(slugs).size, 2)
})

test("codes go in and are counted, and are never shown back", async () => {
  const who = await seller()
  const item = await listed(who, ["SECRET-CODE-1", "SECRET-CODE-2", "", "  SECRET-CODE-3  "])

  const desk = await sellers.desk(who.row, clock)
  assert.equal(desk.items[0].free, 3)
  assert.ok(!JSON.stringify(desk).includes("SECRET-CODE"))
  assert.ok(!JSON.stringify(await sellers.listSellers()).includes("SECRET-CODE"))

  assert.equal((await sellers.addCodes(who.row, item.id, "\n \n")).ok, false)
  assert.equal((await sellers.addCodes(who.row, item.id, Array.from({ length: sellers.CODES_AT_ONCE + 1 }, (_, n) => `C${n}`).join("\n"))).ok, false)

  assert.deepEqual(await sellers.clearCodes(who.row, item.id), { ok: true, removed: 3 })
  assert.equal((await sellers.desk(who.row, clock)).items[0].free, 0)
})

// ---------------------------------------------------------------- an order of a seller's item

test("an order of a seller's item is paid to an address from that seller's key, and handed over", async () => {
  const who = await seller("Key Corner Shop")
  const item = await listed(who, ["GAME-KEY-AAAA"])
  const now = later()

  const shown = await orders.getItem(item.slug, now)
  assert.equal(shown?.seller, "Key Corner Shop")
  assert.equal(shown?.left, 1)

  asked.length = 0
  const { made, result } = await order(item.slug, now)
  assert.ok(result.ok)
  // The invoice was opened with the seller's key to the engine, not the shop's.
  const opened = asked.filter((call) => call.url.endsWith("/api/invoices"))
  assert.equal(opened.length, 1)
  assert.equal(opened[0].key, `Bearer ${who.engineKey}`)
  assert.deepEqual(JSON.parse(opened[0].body), { amount: 10, currency: "USD" })

  const row = await rowOf(result.id)
  assert.equal(row.sellerId, who.row.id)
  assert.ok(row.address.startsWith(`u1from-${who.engineKey}-`))
  assert.equal((await orders.readOrder(result.id, now + MINUTE))?.seller, "Key Corner Shop")

  pay(row.engineRef!, PRICE)
  mine(row.engineRef!, 3)
  const delivered = await orders.readOrder(result.id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(await seal.openSealed(made.secret, delivered!.wrappedKey, delivered!.sealed!), "GAME-KEY-AAAA")

  // The seller sees an order of theirs by a name that is not the buyer's link.
  const desk = await sellers.desk(who.row, now + 6 * MINUTE)
  assert.equal(desk.orders.length, 1)
  assert.equal(desk.orders[0].state, "delivered")
  assert.equal(desk.items[0].given, 1)
  assert.ok(!JSON.stringify(desk).includes(result.id))
  assert.ok(!JSON.stringify(desk).includes("GAME-KEY-AAAA"))
})

test("the shop's own item is still opened with the shop's key", async () => {
  await db.insert(schema.products).values({ slug: "own-voucher", name: "Voucher", blurb: "", priceCents: 1000, kind: "stock" })
  const [own] = await db.select().from(schema.products).where(eq(schema.products.slug, "own-voucher"))
  await db.insert(schema.stock).values({ productId: own.id, payload: "OWN-1" })
  asked.length = 0
  const { result } = await order("own-voucher", later())
  assert.ok(result.ok)
  assert.equal(asked.find((call) => call.url.endsWith("/api/invoices"))?.key, `Bearer ${SHOP_KEY}`)
  assert.equal((await rowOf(result.id)).sellerId, null)
  assert.equal((await orders.readOrder(result.id, clock))?.seller, null)
})

test("what a seller's order is owed is the seller's to send, never on the owner's queue", async () => {
  const who = await seller()
  const other = await seller()
  const item = await listed(who, ["GAME-KEY-BBBB", "GAME-KEY-CCCC"])
  const now = later()

  // Paid twice over: handed over, and the excess is owed by the seller.
  const first = await order(item.slug, now)
  assert.ok(first.result.ok)
  const paid = await rowOf(first.result.id)
  pay(paid.engineRef!, PRICE * 2)
  mine(paid.engineRef!, 3)
  const delivered = await orders.readOrder(first.result.id, now + 5 * MINUTE)
  assert.equal(delivered?.state, "delivered")
  assert.equal(delivered?.owedZat, PRICE)

  // Too little before the lock ran out: nothing handed over, all of it owed by the seller.
  const second = await order(item.slug, now)
  assert.ok(second.result.ok)
  const short = await rowOf(second.result.id)
  pay(short.engineRef!, PRICE / 2)
  const closed = await orders.readOrder(second.result.id, now + 20 * MINUTE)
  assert.equal(closed?.state, "owed")
  assert.equal(closed?.owedZat, PRICE / 2)

  // Neither is on the owner's refund queue, and the owner cannot take one off it.
  assert.deepEqual((await admin.listRefundsDue(now + 21 * MINUTE)).map((entry) => entry.id), [])
  assert.equal(await admin.markRefunded(first.result.id, now + 21 * MINUTE), false)

  // The buyer says where it should go; the seller reads that on their desk.
  const address = "u1" + "q".repeat(20)
  await db.update(schema.orders).set({ refundAddress: address }).where(eq(schema.orders.id, second.result.id))
  const desk = await sellers.desk(who.row, now + 22 * MINUTE)
  const owing = desk.orders.filter((entry) => entry.owedZat > 0 && !entry.refunded)
  assert.equal(owing.length, 2)
  const shortOne = owing.find((entry) => entry.state === "owed")!
  assert.equal(shortOne.owedWhy, "short")
  assert.equal(shortOne.refundAddress, address)

  // Another seller cannot say it was sent. The seller can, once.
  assert.equal((await sellers.sellerRefunded(other.row, shortOne.ref, now + 23 * MINUTE)).ok, false)
  assert.equal((await sellers.sellerRefunded(who.row, "not-a-ref", now + 23 * MINUTE)).ok, false)
  assert.deepEqual(await sellers.sellerRefunded(who.row, shortOne.ref, now + 23 * MINUTE), { ok: true })
  assert.equal((await sellers.sellerRefunded(who.row, shortOne.ref, now + 24 * MINUTE)).ok, false)
  const after = await orders.readOrder(second.result.id, now + 25 * MINUTE)
  assert.equal(after?.state, "refunded")
  assert.equal(after?.refunded, true)
  // Its address is not shown on the desk any more.
  assert.equal((await sellers.desk(who.row, now + 26 * MINUTE)).orders.find((entry) => entry.ref === shortOne.ref)?.refundAddress, null)
})

test("a buyer's report on a seller's item goes to the seller, and the owner sees it without answering", async () => {
  const who = await seller()
  const other = await seller()
  const item = await listed(who, ["GAME-KEY-DDDD"])
  const now = later()
  const { result } = await order(item.slug, now)
  assert.ok(result.ok)
  const row = await rowOf(result.id)
  pay(row.engineRef!, PRICE)
  mine(row.engineRef!, 3)
  assert.equal((await orders.readOrder(result.id, now + 5 * MINUTE))?.state, "delivered")

  // An address whose checksum holds, as the buyer's form requires.
  const address = keyLike("u", 77).slice(0, 2) + keyLike("u", 77).slice(2)
  assert.deepEqual(await orders.reportProblem(result.id, "The key says it was already used.", address, now + 10 * MINUTE), { ok: true })

  // Not on the owner's queue of reports to answer, and the owner's answer does not take.
  assert.deepEqual(await admin.listProblems(), [])
  assert.equal((await admin.answerProblem(result.id, { refunded: false, reply: "No." })).ok, false)
  // But the owner sees it where sellers are looked after.
  assert.equal(await sellers.countSellerReports(), 1)
  const seen = (await sellers.listSellers()).find((entry) => entry.id === who.row.id)!
  assert.deepEqual(seen.reports.map((report) => report.note), ["The key says it was already used."])

  const desk = await sellers.desk(who.row, now + 11 * MINUTE)
  const reported = desk.orders.find((entry) => entry.problem)!
  assert.equal(reported.problem?.answered, false)
  assert.equal(reported.refundAddress, address)

  assert.equal((await sellers.sellerAnswer(other.row, reported.ref, { refunded: true, reply: "Mine." })).ok, false)
  assert.equal((await sellers.sellerAnswer(who.row, reported.ref, { refunded: true, reply: "x".repeat(301) })).ok, false)
  assert.deepEqual(await sellers.sellerAnswer(who.row, reported.ref, { refunded: true, reply: "Sorry. Sent back in full." }, now + 12 * MINUTE), { ok: true })
  assert.equal((await sellers.sellerAnswer(who.row, reported.ref, { refunded: false, reply: "" })).ok, false)

  const read = await orders.readOrder(result.id, now + 13 * MINUTE)
  assert.deepEqual(read?.problem, { note: "The key says it was already used.", at: now + 10 * MINUTE, answered: true, reply: "Sorry. Sent back in full.", refunded: true })
  assert.equal(await sellers.countSellerReports(), 0)
})

// ---------------------------------------------------------------- the owner

test("the owner takes an item down and closes a seller; neither can be undone by the seller", async () => {
  const who = await seller()
  const item = await listed(who, ["GAME-KEY-EEEE", "GAME-KEY-FFFF"])
  const second = await listed(who, ["GAME-KEY-GGGG"])
  const now = later()
  const same = { name: item.name, blurb: item.blurb, price: "10", shelf: "licences" }

  assert.ok(await orders.getItem(item.slug, now))
  assert.deepEqual(await sellers.takeDown(item.id, true, now), { ok: true })
  assert.equal(await orders.getItem(item.slug, now), null)
  assert.deepEqual((await order(item.slug, now)).result, { ok: false, reason: "no-product" })
  // The seller cannot put it back, even by asking for it to be on the shelf.
  assert.equal((await sellers.saveItem(who.row, item.id, { ...same, active: true })).ok, false)
  assert.equal((await sellers.addCodes(who.row, item.id, "MORE")).ok, false)
  await db.update(schema.products).set({ active: true }).where(eq(schema.products.id, item.id))
  assert.equal(await orders.getItem(item.slug, now), null)
  assert.deepEqual((await order(item.slug, now)).result, { ok: false, reason: "no-product" })
  assert.equal((await sellers.desk(who.row, now)).items.find((row) => row.id === item.id)?.takenDown, true)

  // The owner can put it back.
  assert.deepEqual(await sellers.takeDown(item.id, false, now), { ok: true })
  assert.ok(await orders.getItem(item.slug, now))
  // Only a seller's item can be taken down this way.
  const [own] = await db.insert(schema.products).values({ slug: "own-thing", name: "Own", blurb: "", priceCents: 500, kind: "stock" }).returning()
  assert.equal((await sellers.takeDown(own.id, true, now)).ok, false)

  // Closed: nothing of theirs is sold and they can list nothing; their desk still opens.
  assert.deepEqual(await sellers.closeSeller(who.row.id, true, now), { ok: true })
  const closed = (await sellers.sellerOf(who.token))!
  assert.equal(await orders.getItem(item.slug, now), null)
  assert.equal(await orders.getItem(second.slug, now), null)
  assert.deepEqual((await order(second.slug, now)).result, { ok: false, reason: "no-product" })
  assert.equal((await sellers.addItem(closed, same)).ok, false)
  assert.equal((await sellers.addCodes(closed, second.id, "MORE")).ok, false)
  assert.equal((await sellers.saveItem(closed, second.id, { ...same, active: true })).ok, false)
  assert.equal((await sellers.desk(closed, now)).closed, true)

  assert.deepEqual(await sellers.closeSeller(who.row.id, false, now), { ok: true })
  assert.ok(await orders.getItem(second.slug, now))
  assert.equal((await sellers.closeSeller("nobody", true, now)).ok, false)
})

test("a seller of one network sells nothing on the other, and nothing while selling is switched off", async () => {
  const who = await seller()
  const item = await listed(who, ["GAME-KEY-HHHH"])
  const now = later()
  assert.ok(await orders.getItem(item.slug, now))

  real("testnet")
  cipherpay.forgetHealth()
  assert.equal(await orders.getItem(item.slug, now), null)
  assert.deepEqual((await order(item.slug, now)).result, { ok: false, reason: "no-product" })
  assert.equal((await sellers.desk(who.row, now)).open, false)

  real()
  delete process.env.SELLING
  assert.equal(await orders.getItem(item.slug, now), null)
  assert.deepEqual((await order(item.slug, now)).result, { ok: false, reason: "no-product" })
  assert.ok(!(await orders.listItems(now)).some((row) => row.seller !== null))

  process.env.SELLING = "open"
  assert.ok(await orders.getItem(item.slug, now))
})
