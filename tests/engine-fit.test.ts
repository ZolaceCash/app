import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// The alarm for an engine that can no longer read the chain: the explorer says which upgrade the
// chain is on, and that is held against the upgrades the engine was built for. The explorer, the
// engine and the owner's notification service are played here.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

const ENGINE = "http://engine.test:3080"
const SCAN = "http://scan.test"
const NTFY = "https://ntfy.example/a-long-random-topic"

// The explorer's answer, in the shape the real one has (read on 13 Oct 2026).
const chain = (tip: string, next: string, more: Record<string, { name: string; activationheight: number; status: string }> = {}, blocks = 3_516_000) => ({
  chain: "main",
  blocks,
  upgrades: {
    c2d6d0b4: { name: "NU5", activationheight: 1_687_104, status: "active" },
    "37a5165b": { name: "NU6.3", activationheight: 3_428_143, status: "active" },
    ...more,
  },
  consensus: { chaintip: tip, nextblock: next },
})
const NU7 = { "77190ad9": { name: "NU7", activationheight: 3_600_000, status: "pending" } }
const NU8 = { abcdef01: { name: "NU8", activationheight: 3_520_000, status: "pending" } }

let explorer: unknown = chain("37a5165b", "37a5165b")
let explorerUp = true
let asked = 0
let sent: string[] = []
let invoices = 0

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("kraken")) return new Response(JSON.stringify({ result: { XZECZUSD: { c: ["1000"] } } }))
  if (url.includes("coinbase")) return new Response(JSON.stringify({ data: { amount: "1000" } }))
  if (url === `${SCAN}/api/blockchain-info`) {
    asked += 1
    if (!explorerUp) throw new Error("connection refused")
    return new Response(JSON.stringify(explorer))
  }
  if (url === `${ENGINE}/api/health`) return new Response(JSON.stringify({ status: "ok" }))
  if (url === `${ENGINE}/api/invoices`) {
    invoices += 1
    return new Response(JSON.stringify({ invoice_id: `inv-${invoices}`, payment_address: `u1address${invoices}`, price_zec: 0.01, zec_rate: 1000 }), { status: 201 })
  }
  if (url.startsWith(NTFY)) {
    sent.push(String(init?.body ?? ""))
    return new Response("")
  }
  return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
}) as typeof fetch

let fit: typeof import("@/lib/engine-fit")
let payment: typeof import("@/lib/payment")
let cipherpay: typeof import("@/lib/cipherpay")
let orders: typeof import("@/lib/orders")
let notify: typeof import("@/lib/owner-notify")
let seal: typeof import("@/lib/seal")
let now = Date.UTC(2026, 9, 13, 12)

before(async () => {
  fit = await import("@/lib/engine-fit")
  payment = await import("@/lib/payment")
  cipherpay = await import("@/lib/cipherpay")
  orders = await import("@/lib/orders")
  notify = await import("@/lib/owner-notify")
  seal = await import("@/lib/seal")
  const { getDb, schema } = await import("@/lib/db")
  const db = await getDb()
  const [product] = await db.insert(schema.products).values({ slug: "voucher", name: "Voucher", blurb: "", priceCents: 1000, kind: "stock" }).returning()
  for (let i = 0; i < 20; i++) await db.insert(schema.stock).values({ productId: product.id, payload: `CODE-${i}` })
})

beforeEach(() => {
  process.env.CIPHERPAY_URL = ENGINE
  process.env.CIPHERPAY_API_KEY = "cpay_test_key"
  process.env.CIPHERSCAN_API_URL = SCAN
  process.env.PAYMENT_NETWORK = "mainnet"
  process.env.OWNER_NOTIFY_URL = NTFY
  explorer = chain("37a5165b", "37a5165b")
  explorerUp = true
  asked = 0
  sent = []
  now += 2 * 60 * 60 * 1000
  cipherpay.forgetHealth()
  notify.forgetNotices()
})

async function order() {
  const keys = await seal.newOrderKeys()
  return orders.createOrder({ slug: "voucher", publicKey: keys.publicKey, wrappedKey: keys.wrappedKey, now })
}

// ---------------------------------------------------------------- reading the explorer's answer

test("the explorer's answer is read for what the engine can and cannot read", () => {
  assert.deepEqual(fit.fitOf(chain("37a5165b", "37a5165b")), { state: "fits", upgrade: "NU6.3" })
  // NU7 is one the engine was built for: scheduled or active, it fits.
  assert.deepEqual(fit.fitOf(chain("37a5165b", "37a5165b", NU7)), { state: "fits", upgrade: "NU6.3" })
  assert.deepEqual(fit.fitOf(chain("77190ad9", "77190ad9", { "77190ad9": { ...NU7["77190ad9"], status: "active" } }, 3_700_000)), { state: "fits", upgrade: "NU7" })
  // One it was not built for, scheduled: ahead, with the block and how far off it is.
  assert.deepEqual(fit.fitOf(chain("37a5165b", "37a5165b", NU8)), { state: "ahead", upgrade: "NU6.3", next: "NU8", atBlock: 3_520_000, blocksLeft: 4000 })
  // The block before it takes effect: the next block is already the new upgrade's.
  assert.deepEqual(fit.fitOf(chain("37a5165b", "abcdef01", NU8, 3_519_999)), { state: "unread", upgrade: "NU8" })
  assert.deepEqual(fit.fitOf(chain("abcdef01", "abcdef01", NU8, 3_520_010)), { state: "unread", upgrade: "NU8" })
  // An upgrade the explorer has no name for is named by its branch.
  assert.deepEqual(fit.fitOf(chain("0badc0de", "0badc0de")), { state: "unread", upgrade: "0badc0de" })
  for (const nothing of [null, {}, { consensus: {} }, { consensus: { chaintip: "37a5165b", nextblock: "37a5165b" } }, "down for maintenance"]) {
    assert.deepEqual(fit.fitOf(nothing), { state: "unknown" })
  }
  assert.equal(fit.aboutUntil(10), "under an hour")
  assert.equal(fit.aboutUntil(480), "about 10 hours")
  assert.equal(fit.aboutUntil(4000), "about 3 days")
})

// ---------------------------------------------------------------- what the shop does with it

test("orders start while the engine reads the chain, and while an upgrade is only scheduled", async () => {
  assert.equal((await order()).ok, true)
  explorer = chain("37a5165b", "37a5165b", NU8)
  cipherpay.forgetHealth()
  assert.equal((await order()).ok, true)
  assert.deepEqual((await payment.engineFitNow(now))?.state, "ahead")
})

test("no order is started once the chain is on an upgrade the engine cannot read", async () => {
  explorer = chain("abcdef01", "abcdef01", NU8, 3_520_010)
  const before = invoices
  assert.deepEqual(await order(), { ok: false, reason: "no-engine" })
  // Nothing was asked of the engine for it: no address was made.
  assert.equal(invoices, before)

  // The engine is rebuilt and the chain is one it reads again: orders start by themselves.
  explorer = chain("77190ad9", "77190ad9", { "77190ad9": { name: "NU7", activationheight: 3_600_000, status: "active" } }, 3_700_000)
  cipherpay.forgetHealth()
  assert.equal((await order()).ok, true)
})

test("an explorer that does not answer decides nothing, and what was last known stands for an hour", async () => {
  explorerUp = false
  assert.deepEqual(await payment.engineFitNow(now), { state: "unknown" })
  assert.equal((await order()).ok, true)

  // It answered "unread", and then went silent: the alarm stays on.
  explorerUp = true
  explorer = chain("abcdef01", "abcdef01", NU8, 3_520_010)
  cipherpay.forgetHealth()
  assert.equal((await payment.engineFitNow(now))?.state, "unread")
  explorerUp = false
  assert.equal((await payment.engineFitNow(now + 10 * 60 * 1000))?.state, "unread")
  assert.equal((await payment.engineFitNow(now + 61 * 60 * 1000))?.state, "unknown")
})

test("the explorer is asked once for a burst of orders", async () => {
  await payment.engineFitNow(now)
  await payment.engineFitNow(now + 1000)
  await payment.engineFitNow(now + 60_000)
  assert.equal(asked, 1)
  await payment.engineFitNow(now + 4 * 60_000)
  assert.equal(asked, 2)
})

test("the stand-in watches no chain, so it has no alarm", async () => {
  delete process.env.CIPHERPAY_URL
  assert.equal(await payment.engineFitNow(now), null)
  assert.equal(asked, 0)
})

// ---------------------------------------------------------------- telling the owner

test("the owner is told once when an upgrade is scheduled, and once when it is there", async () => {
  assert.equal(await notify.ownerTick(now), 0)

  explorer = chain("37a5165b", "37a5165b", NU8)
  cipherpay.forgetHealth()
  assert.equal(await notify.ownerTick(now), 1)
  assert.match(sent[0], /upgrade is scheduled that the payment engine cannot read/)
  assert.equal(await notify.ownerTick(now + 60_000), 0)

  explorer = chain("abcdef01", "abcdef01", NU8, 3_520_010)
  cipherpay.forgetHealth()
  assert.equal(await notify.ownerTick(now + 5 * 60_000), 1)
  assert.match(sent[1], /on an upgrade the payment engine cannot read\. No order is started/)
  assert.equal(await notify.ownerTick(now + 6 * 60_000), 0)
  // A line names no block, no order and no amount.
  for (const line of sent) assert.ok(!/\d{3,}/.test(line), line)
})
