import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, beforeEach, test } from "node:test"

// The server tells the owner that something waits: once per thing, with a line that names
// nothing. The notification service is played here, and so are the two price sources. Orders
// that have to look paid for real are written into the database as such: the stand-in's own
// orders are test orders, and nobody is told about those.

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-")), "test.db")}`

const NTFY = "https://ntfy.example/a-long-random-topic"
const ADDRESS = "utest1eyxyvdjxyc20xyf66rttcsxgmhtt8xewaaylfg5tn5v57h57nsvcmk9jy3qfszxjjg298dwpk0fjwc2e2h576sq7gmshhgyrzc05wcr0"
const HOUR = 60 * 60 * 1000

type Sent = { url: string; type: string | null; body: string }
let sent: Sent[] = []
let serviceUp = true

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("kraken")) return new Response(JSON.stringify({ result: { XZECZUSD: { c: ["1000"] } } }))
  if (url.includes("coinbase")) return new Response(JSON.stringify({ data: { amount: "1000" } }))
  sent.push({ url, type: new Headers(init?.headers).get("Content-Type"), body: String(init?.body ?? "") })
  return new Response("", { status: serviceUp ? 200 : 503 })
}) as typeof fetch

let orders: typeof import("@/lib/orders")
let admin: typeof import("@/lib/admin")
let notify: typeof import("@/lib/owner-notify")
let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>
let schema: typeof import("@/lib/db").schema
let productId: number
let serial = 0

before(async () => {
  orders = await import("@/lib/orders")
  admin = await import("@/lib/admin")
  notify = await import("@/lib/owner-notify")
  const database = await import("@/lib/db")
  db = await database.getDb()
  schema = database.schema
  await admin.createProduct({ slug: "gift-card", name: "Gift card $10", blurb: "", priceCents: 1150, byHand: true })
  productId = (await admin.listProducts()).find((product) => product.slug === "gift-card")!.id
})

beforeEach(async () => {
  sent = []
  serviceUp = true
  process.env.OWNER_NOTIFY_URL = NTFY
  notify.forgetNotices()
  await db.delete(schema.orders)
})

// A real order (not a test one) in the state given. A paid one with no name at the engine is
// left where it is when it is looked at, so its `readyAt` decides whether the owner has it.
async function order(values: Partial<typeof schema.orders.$inferInsert>) {
  const now = Date.now()
  const id = `order-${++serial}`
  await db.insert(schema.orders).values({
    id,
    productId,
    state: "confirmed",
    priceCents: 1150,
    zat: 1_150_000,
    receivedZat: 1_150_000,
    address: "utest1madeupfortheorder",
    publicKey: "{}",
    wrappedKey: "{}",
    test: false,
    createdAt: now - HOUR,
    expiresAt: now + 14 * 60 * 1000,
    seenAt: now - 10 * 60 * 1000,
    ...values,
  })
  return id
}

test("a paid order that waits for its item is said once, and names nothing", async () => {
  const now = Date.now()
  const id = await order({ readyAt: now - 60_000 })

  assert.equal(await notify.ownerTick(now), 1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, NTFY)
  assert.match(sent[0].type ?? "", /^text\/plain/)
  assert.match(sent[0].body, /an order is paid and waits for its item/)
  assert.match(sent[0].body, /within 12 hours/)
  // No order, no item and no amount are in the line.
  for (const secret of [id, "Gift card", "11.50", "1150", "0.0115"]) assert.ok(!sent[0].body.includes(secret), secret)

  assert.equal(await notify.ownerTick(now + 60_000), 0)
  assert.equal(await notify.ownerTick(now + HOUR), 0)
  assert.equal(sent.length, 1)
})

test("nothing is said about an order whose money is not in yet", async () => {
  const now = Date.now()
  await order({ state: "waiting", receivedZat: 0, seenAt: null, readyAt: null })
  assert.equal(await notify.ownerTick(now), 0)
  assert.equal(sent.length, 0)
})

test("the owner is told a second time when the time is nearly up, and once only", async () => {
  const now = Date.now()
  await order({ readyAt: now })
  await notify.ownerTick(now + 60_000)
  assert.equal(sent.length, 1)

  assert.equal(await notify.ownerTick(now + 9 * HOUR), 0)
  assert.equal(await notify.ownerTick(now + 10 * HOUR + 60_000), 1)
  assert.match(sent[1].body, /still waits for its item/)
  assert.equal(await notify.ownerTick(now + 11 * HOUR), 0)

  // Past its time it is owed back: off the owner's list, and that is said as a refund.
  assert.equal(await notify.ownerTick(now + 12 * HOUR + 60_000), 1)
  assert.match(sent[2].body, /a refund is due/)
})

test("a line that did not go out is tried again on the next round", async () => {
  const now = Date.now()
  await order({ readyAt: now - 60_000 })
  serviceUp = false
  assert.equal(await notify.ownerTick(now), 0)
  assert.equal(sent.length, 1)

  serviceUp = true
  assert.equal(await notify.ownerTick(now + 60_000), 1)
  assert.equal(await notify.ownerTick(now + 120_000), 0)
  assert.equal(sent.length, 2)
})

test("a buyer's report and a refund that is due are each said once", async () => {
  const now = Date.now()
  const delivered = await order({ state: "delivered", deliveredAt: now - HOUR, closedAt: now - HOUR })
  await order({ state: "owed", owedZat: 500_000, receivedZat: 500_000 })
  assert.ok((await orders.reportProblem(delivered, "The code is not valid, tried it twice.", ADDRESS)).ok)

  assert.equal(await notify.ownerTick(now), 2)
  assert.deepEqual(sent.map((line) => line.body.replace(/^Zolace: /, "").split(".")[0]).sort(), ["a buyer reported a problem with an item", "a refund is due"])
  assert.equal(await notify.ownerTick(now + 60_000), 0)
})

test("the line is wrapped the way the service takes it", async () => {
  process.env.OWNER_NOTIFY_URL = "https://api.telegram.org/bot123:abc/sendMessage?chat_id=42"
  assert.equal(await notify.sendNotice("One line."), true)
  assert.equal(sent[0].type, "application/json")
  assert.deepEqual(JSON.parse(sent[0].body), { text: "One line." })

  process.env.OWNER_NOTIFY_URL = "https://discord.com/api/webhooks/1/abc"
  assert.equal(await notify.sendNotice("One line."), true)
  assert.deepEqual(JSON.parse(sent[1].body), { content: "One line." })
})

test("without an address, or with one that is not https, nothing is sent and paid orders still move", async () => {
  const now = Date.now()
  const id = await order({ readyAt: now - 13 * HOUR })

  for (const address of ["", "http://ntfy.example/topic", "not an address"]) {
    process.env.OWNER_NOTIFY_URL = address
    assert.equal(notify.noticesOn(), false)
    assert.equal(await notify.sendNotice("One line."), false)
    assert.equal(await notify.ownerTick(now), 0)
  }
  assert.equal(sent.length, 0)
  // Its time ran out thirteen hours after the confirmation: the round moved it to "owed".
  assert.equal((await orders.readOrder(id, now))?.state, "owed")
})
