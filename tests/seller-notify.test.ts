import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// A seller is told that something waits for them, at an address they gave: once per thing, with a
// line that names nothing, and only to one of three services. The services are played here. The
// orders are written into the database as they would stand: what moves an order is tested in
// tests/sellers.test.ts.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

const NTFY = "https://ntfy.sh/a-long-random-topic-name"
const TELEGRAM = "https://api.telegram.org/bot123456789:AAExampleExampleExampleExampleExample/sendMessage?chat_id=-1001234567890"
const DISCORD = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL"
const MINUTE = 60_000

type Sent = { url: string; type: string | null; body: string; redirect: string | undefined }
let sent: Sent[] = []
let serviceUp = true

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  sent.push({ url: String(input), type: new Headers(init?.headers).get("Content-Type"), body: String(init?.body ?? ""), redirect: init?.redirect })
  return new Response("", { status: serviceUp ? 200 : 503 })
}) as typeof fetch

let notify: typeof import("@/lib/seller-notify")
let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>
let schema: typeof import("@/lib/db").schema
let eq: typeof import("drizzle-orm").eq
let serial = 0
let now = Date.UTC(2026, 9, 13, 8)

before(async () => {
  notify = await import("@/lib/seller-notify")
  ;({ eq } = await import("drizzle-orm"))
  const database = await import("@/lib/db")
  db = await database.getDb()
  schema = database.schema
})

beforeEach(async () => {
  sent = []
  serviceUp = true
  now += 60 * MINUTE
  notify.forgetSellerNotices()
  await db.delete(schema.orders)
  await db.delete(schema.stock)
  await db.delete(schema.products)
  await db.delete(schema.sellers)
})

async function seller(address: string | null = NTFY) {
  const id = `seller-${++serial}`
  await db.insert(schema.sellers).values({ id, name: `Seller ${serial}`, slug: id, tokenHash: `hash-${serial}`, engineKey: `key-${serial}`, network: "mainnet", createdAt: now, notifyUrl: address })
  const [row] = await db.select().from(schema.sellers).where(eq(schema.sellers.id, id))
  return row
}
async function item(sellerId: string, codes: ("free" | "given")[], active = true) {
  const [product] = await db
    .insert(schema.products)
    .values({ slug: `item-${++serial}`, name: "Game key", blurb: "", priceCents: 1000, kind: "stock", active, sellerId })
    .returning()
  for (const state of codes) await db.insert(schema.stock).values({ productId: product.id, payload: state === "free" ? "CODE" : null, state })
  return product
}
async function order(sellerId: string | null, productId: number, values: Partial<typeof schema.orders.$inferInsert>) {
  const id = `order-${++serial}`
  await db.insert(schema.orders).values({
    id,
    productId,
    sellerId,
    state: "delivered",
    priceCents: 1000,
    zat: 1_000_000,
    address: "u1address",
    publicKey: "{}",
    wrappedKey: "{}",
    test: false,
    createdAt: now - 30 * MINUTE,
    expiresAt: now - 15 * MINUTE,
    ...values,
  })
  return id
}
const lines = () => sent.map((entry) => entry.body)

// ---------------------------------------------------------------- which addresses are taken

test("only an ntfy topic, a Telegram bot and a Discord webhook are taken as an address", () => {
  for (const good of [NTFY, TELEGRAM, DISCORD, ` ${NTFY} `, "https://discordapp.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL", "https://api.telegram.org/bot123456789:AAExampleExampleExampleExampleExample/sendMessage?chat_id=@mychannel"]) {
    assert.ok(notify.noticeAddress(good), good)
  }
  for (const bad of [
    "",
    "ntfy.sh/a-long-random-topic-name",
    "http://ntfy.sh/a-long-random-topic-name",
    // A topic short enough to guess.
    "https://ntfy.sh/alerts",
    "https://ntfy.sh/a-long-random-topic-name/json",
    "https://ntfy.sh/a-long-random-topic-name?x=1",
    "https://ntfy.sh:8443/a-long-random-topic-name",
    "https://user:pass@ntfy.sh/a-long-random-topic-name",
    // Any other host: the server's own network, another service, a look-alike.
    "https://ntfy.example/a-long-random-topic-name",
    "https://ntfy.sh.evil.example/a-long-random-topic-name",
    "https://localhost/a-long-random-topic-name",
    "https://127.0.0.1/a-long-random-topic-name",
    "https://169.254.169.254/latest/meta-data/iam/x",
    "https://engine:3080/api/merchants-and-more",
    // The services' other doors.
    "https://api.telegram.org/bot123456789:AAExampleExampleExampleExampleExample/getUpdates",
    "https://api.telegram.org/bot123456789:AAExampleExampleExampleExampleExample/sendMessage?chat_id=1&text=hello",
    "https://discord.com/api/users/@me/and-something-longer-than-twenty",
    "javascript:alert(1)//aaaaaaaaaaaaaaaaaaaaaaaa",
    `https://ntfy.sh/${"a".repeat(400)}`,
  ]) {
    assert.equal(notify.noticeAddress(bad), null, bad)
  }
  assert.equal(notify.noticeWhere(NTFY), "ntfy")
  assert.equal(notify.noticeWhere(TELEGRAM), "Telegram")
  assert.equal(notify.noticeWhere(DISCORD), "Discord")
  assert.equal(notify.noticeWhere(null), null)
  assert.equal(notify.noticeWhere("https://example.com/hook"), null)
})

test("a seller sets, tries and takes away their address", async () => {
  const who = await seller(null)
  assert.equal((await notify.setNotice(who, "https://example.com/hook-that-is-long-enough")).ok, false)
  assert.equal((await notify.testNotice(who, now)).ok, false)

  assert.deepEqual(await notify.setNotice(who, ` ${DISCORD} `), { ok: true })
  const [kept] = await db.select().from(schema.sellers).where(eq(schema.sellers.id, who.id))
  assert.equal(kept.notifyUrl, DISCORD)

  assert.deepEqual(await notify.testNotice(kept, now), { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, DISCORD)
  // Discord wants the line wrapped; a redirect is not followed.
  assert.deepEqual(JSON.parse(sent[0].body), { content: notify.LINES.test })
  assert.equal(sent[0].redirect, "manual")
  // The button is not a way to fill a channel.
  assert.equal((await notify.testNotice(kept, now + 5000)).ok, false)
  assert.equal(sent.length, 1)
  assert.deepEqual(await notify.testNotice(kept, now + 31_000), { ok: true })

  serviceUp = false
  assert.equal((await notify.testNotice(kept, now + 70_000)).ok, false)

  assert.deepEqual(await notify.setNotice(kept, "  "), { ok: true })
  assert.equal((await db.select().from(schema.sellers).where(eq(schema.sellers.id, who.id)))[0].notifyUrl, null)
})

// ---------------------------------------------------------------- what a seller is told

test("a seller is told once about a sale, a report and a refund of theirs, and nobody else's", async () => {
  const who = await seller(NTFY)
  const other = await seller(TELEGRAM)
  const silent = await seller(null)
  const product = await item(who.id, ["free", "given"])
  const theirs = await item(other.id, ["free"])
  const quiet = await item(silent.id, ["free"])

  // Nothing waits: a round sends nothing.
  assert.equal(await notify.sellerTick(now), 0)

  const sold = await order(who.id, product.id, { deliveredAt: now + MINUTE })
  await order(who.id, product.id, { problem: "It says it was used.", problemAt: now + MINUTE, deliveredAt: now - 20 * MINUTE })
  await order(who.id, product.id, { state: "owed", owedZat: 500_000, receivedZat: 500_000 })
  // Another seller's sale, the shop's own order, a test order and a seller with no address.
  await order(other.id, theirs.id, { deliveredAt: now + MINUTE })
  await order(null, product.id, { deliveredAt: now + MINUTE, owedZat: 10, problem: "x", problemAt: now })
  await order(who.id, product.id, { deliveredAt: now + MINUTE, test: true })
  await order(silent.id, quiet.id, { deliveredAt: now + MINUTE })

  assert.equal(await notify.sellerTick(now + 2 * MINUTE), 4)
  const mine = sent.filter((entry) => entry.url === NTFY).map((entry) => entry.body)
  assert.deepEqual(mine.sort(), [notify.LINES.refund, notify.LINES.report, notify.LINES.sold].sort())
  const others = sent.filter((entry) => entry.url === TELEGRAM)
  assert.deepEqual(others.map((entry) => JSON.parse(entry.body)), [{ text: notify.LINES.sold }])
  // A line names no order, no item, no amount and no buyer.
  for (const line of lines()) assert.ok(!line.includes(sold) && !/Game key|500|0\.0|u1address/.test(line), line)

  // Said once: the next rounds are silent.
  sent = []
  assert.equal(await notify.sellerTick(now + 3 * MINUTE), 0)
  assert.equal(await notify.sellerTick(now + 4 * MINUTE), 0)
  assert.equal(sent.length, 0)
})

test("a sale from before the server started is not told again, and what still waits is", async () => {
  const who = await seller(NTFY)
  const product = await item(who.id, ["free", "given"])
  await order(who.id, product.id, { deliveredAt: now - 5 * MINUTE })
  await order(who.id, product.id, { problem: "Does not work at all.", problemAt: now - 40 * MINUTE, deliveredAt: now - 50 * MINUTE })

  assert.equal(await notify.sellerTick(now), 1)
  assert.deepEqual(lines(), [notify.LINES.report])
})

test("a line that did not go out is tried again on the next round", async () => {
  const who = await seller(NTFY)
  const product = await item(who.id, ["free", "given"])
  await order(who.id, product.id, { state: "owed", owedZat: 500_000, receivedZat: 500_000 })

  serviceUp = false
  assert.equal(await notify.sellerTick(now), 0)
  serviceUp = true
  assert.equal(await notify.sellerTick(now + MINUTE), 1)
  assert.equal(await notify.sellerTick(now + 2 * MINUTE), 0)
})

test("a seller is told when an item on the shelf runs out, and again the next time it does", async () => {
  const who = await seller(NTFY)
  const product = await item(who.id, ["given"])
  // An item that never sold, an item off the shelf and one the shop took down say nothing.
  await item(who.id, [])
  await item(who.id, ["given"], false)
  const down = await item(who.id, ["given"])
  await db.update(schema.products).set({ takenDownAt: now }).where(eq(schema.products.id, down.id))

  assert.equal(await notify.sellerTick(now), 1)
  assert.deepEqual(lines(), [notify.LINES.empty])
  assert.equal(await notify.sellerTick(now + MINUTE), 0)

  // Codes are added, and sold again.
  await db.insert(schema.stock).values({ productId: product.id, payload: "MORE" })
  assert.equal(await notify.sellerTick(now + 2 * MINUTE), 0)
  await db.update(schema.stock).set({ state: "given", payload: null }).where(eq(schema.stock.productId, product.id))
  assert.equal(await notify.sellerTick(now + 3 * MINUTE), 1)
})
