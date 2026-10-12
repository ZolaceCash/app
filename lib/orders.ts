import { and, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import type { Order, ShelfSlug } from "@/lib/db/schema"
import { LOCK_MS, PROBLEM_MAX, PROBLEM_MIN } from "@/lib/order-times"
import { CONFIRMATIONS_NEEDED, engine, FEE_ZAT, sellerEngine, type Network, type PaymentEngine, type Seen } from "@/lib/payment"
import { quoteZec } from "@/lib/price"
import { sealTo, type PublicKey, type Sealed, type Wrapped } from "@/lib/seal"
import { sellingOn } from "@/lib/selling"
import { canSupply, supplierOn, supply } from "@/lib/supplier"
import { maskAddress, shieldedAddress } from "@/lib/zcash-address"

const { orders, products, sellers, stock } = schema

export { LOCK_MS }

// How long a paid order waits for a supplier to make its item before it is given up on and owed
// back. The supplier says an eSIM takes up to half a minute; this is for the day it does not come.
export const SUPPLY_WAIT_MS = 30 * 60 * 1000

// How long the owner has to buy an item that is bought by hand and to hand it over, counted from
// when the payment was three blocks deep. After that the payment is owed back. Twelve hours
// unless HAND_HOURS says otherwise.
export function handHours() {
  const hours = Number(process.env.HAND_HOURS ?? "")
  return Number.isFinite(hours) && hours > 0 ? hours : 12
}
const handWaitMs = () => handHours() * 60 * 60 * 1000

// PLAN.md says orders are deleted "some days" after they are done and leaves the number open.
// Seven is a placeholder until the owner fixes it; ORDER_RETENTION_DAYS overrides it.
const RETENTION_MS = Number(process.env.ORDER_RETENTION_DAYS ?? 7) * 24 * 60 * 60 * 1000

// How long after its price lock an order is still watched for money: a payment that comes late, or
// a second one. Whatever arrives in that time is found and owed back. The payment engine has to
// watch an invoice at least as long (its INVOICE_EXPIRY_MINUTES, engine/cipherpay/). Seven days
// unless PAYMENT_WATCH_HOURS says otherwise, and never longer than an order is kept: a payment
// to an order that was already deleted could not be matched to anything.
export function watchMs() {
  const hours = Number(process.env.PAYMENT_WATCH_HOURS ?? "")
  const asked = (Number.isFinite(hours) && hours > 0 ? hours : 7 * 24) * 60 * 60 * 1000
  return Math.min(asked, RETENTION_MS)
}

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-product" | "no-stock" | "no-price" | "price-disagree" | "no-engine" }

function newId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 24)
}

// A made-up code for a test item. It unlocks nothing.
function testCode() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const text = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
  return `TEST-${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`
}

export async function createOrder(input: {
  slug: string
  publicKey: PublicKey
  wrappedKey: Wrapped
  now?: number
}): Promise<CreateResult> {
  const db = await getDb()
  const now = input.now ?? Date.now()
  const pay = engine()

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, input.slug), eq(products.active, true)))
  if (!product) return { ok: false, reason: "no-product" }
  // A made-up item is never sold for real money.
  if (product.kind === "test" && pay.network === "mainnet") return { ok: false, reason: "no-product" }

  // An item a supplier makes is only sold while the supplier can make it: it lists the package,
  // it costs the owner no more than the price here, and the owner's balance there covers it.
  if (product.kind === "supplier") {
    if (pay.network === "stand-in" || !product.supplierRef) return { ok: false, reason: "no-product" }
    if (!(await canSupply(product.supplierRef, product.priceCents, now))) return { ok: false, reason: "no-stock" }
  }

  // Another seller's item: its address is made from the seller's viewing key, so the payment goes
  // to the seller's wallet. It is sold only while selling is open, the seller has not been closed,
  // the item has not been taken down, and the seller's key is of the network payments run on.
  let payee: PaymentEngine = pay
  if (product.sellerId) {
    const [seller] = await db.select().from(sellers).where(eq(sellers.id, product.sellerId))
    const theirs = seller ? sellerEngine(seller.engineKey) : null
    if (!sellingOn() || !seller || seller.closedAt !== null || product.takenDownAt !== null || product.kind !== "stock") {
      return { ok: false, reason: "no-product" }
    }
    if (!theirs || seller.network !== pay.network) return { ok: false, reason: "no-product" }
    payee = theirs
  }

  // An engine that cannot be trusted to see a payment takes no order: a buyer would pay into silence.
  if (!(await pay.healthy())) return { ok: false, reason: "no-engine" }

  const quote = await quoteZec(now)
  if (!quote.ok) return { ok: false, reason: quote.reason === "disagree" ? "price-disagree" : "no-price" }

  // Codes held by orders that ran out of time go back on the shelf before one is looked for.
  await sweep(now)

  const id = newId()

  // Set an item aside for this order: a fresh made-up code for a test product, otherwise one
  // free code from the stock, claimed only if nobody else took it in the meantime. An item a
  // supplier makes, or the owner buys by hand, has nothing to set aside: it is bought when the
  // order is paid.
  let stockId: number | null
  if (product.kind === "supplier" || product.kind === "hand") {
    stockId = null
  } else if (product.kind === "test") {
    const [row] = await db
      .insert(stock)
      .values({ productId: product.id, payload: testCode(), state: "held", orderId: id })
      .returning({ id: stock.id })
    stockId = row.id
  } else {
    const claimed = await db
      .update(stock)
      .set({ state: "held", orderId: id })
      .where(
        eq(
          stock.id,
          sql`(select ${stock.id} from ${stock} where ${stock.productId} = ${product.id} and ${stock.state} = 'free' limit 1)`
        )
      )
      .returning({ id: stock.id })
    if (claimed.length === 0) return { ok: false, reason: "no-stock" }
    stockId = claimed[0].id
  }

  // Only now is an address asked for: an order that found no item has cost the engine nothing.
  const opened = await payee.open({ orderId: id, priceCents: product.priceCents, usdPerZec: quote.usdPerZec })
  if (!opened.ok) {
    await releaseStock({ stockId, productId: product.id })
    return { ok: false, reason: opened.reason === "price-disagree" ? "price-disagree" : "no-engine" }
  }

  await db.insert(orders).values({
    id,
    productId: product.id,
    stockId,
    sellerId: product.sellerId,
    state: "waiting",
    priceCents: product.priceCents,
    zat: opened.zat,
    address: opened.address,
    engineRef: opened.ref,
    publicKey: JSON.stringify(input.publicKey),
    wrappedKey: JSON.stringify(input.wrappedKey),
    test: pay.network === "stand-in",
    createdAt: now,
    expiresAt: now + LOCK_MS,
  })

  await purge(now)
  return { ok: true, id }
}

// The stand-in for "the network has seen your payment". Only test orders can be paid this way.
export async function payTestOrder(id: string, now = Date.now()) {
  const db = await getDb()
  const updated = await db
    .update(orders)
    .set({ state: "seen", seenAt: now })
    .where(and(eq(orders.id, id), eq(orders.state, "waiting"), eq(orders.test, true)))
    .returning({ id: orders.id })
  return updated.length > 0
}

const OPEN = ["waiting", "underpaid"] as const
const PAID = ["seen", "confirmed"] as const

// Moves an order along as far as time and the payment engine allow, and returns it with how many
// blocks deep its payment is. Called whenever an order is read, so nothing has to run in the
// background.
//
// The rule it keeps: the item is handed over for the whole amount, seen by the engine before the
// price lock ran out. Anything else that arrives (too little, too late) is owed back, and so is
// what was paid above the price.
async function advance(order: Order, now: number): Promise<{ order: Order; confirmations: number }> {
  const db = await getDb()
  const isOpen = order.state === "waiting" || order.state === "underpaid"
  const isPaid = order.state === "seen" || order.state === "confirmed"
  // A real order that is over is still looked at for a while: a payment may come late, and a
  // buyer may pay twice.
  const lateWatch =
    (order.state === "expired" || order.state === "owed" || order.state === "delivered") &&
    order.engineRef !== null &&
    order.refundedAt === null &&
    now <= order.expiresAt + watchMs()

  let seen: Seen | null = null
  if (isOpen || isPaid || lateWatch) {
    seen = await engine().look(
      { orderId: order.id, ref: order.engineRef, address: order.address, zat: order.zat, seenAt: order.seenAt, txid: order.txid },
      now
    )
  }
  const arrived = seen ? Math.max(seen.receivedZat, order.receivedZat) : order.receivedZat
  const inFull = seen !== null && (seen.state === "seen" || seen.state === "confirmed")

  if (isOpen) {
    // Paid in full before the lock was found to have run out: the order goes on, however long
    // ago that was. The engine saw it in time, and that is what counts.
    if (inFull && seen) {
      const [moved] = await db
        .update(orders)
        .set({ state: "seen", seenAt: order.seenAt ?? now, receivedZat: arrived, txid: seen.txid })
        .where(and(eq(orders.id, order.id), inArray(orders.state, [...OPEN])))
        .returning()
      if (moved) return advance(moved, now)
    } else if (now > order.expiresAt && (seen !== null || order.engineRef === null || now > order.expiresAt + watchMs())) {
      // The lock ran out. With nothing arrived the order simply ends; with part of the amount
      // arrived, that part is owed back. An order whose engine did not answer is left open
      // until it does: closing it unseen could hand a paid-for code to someone else.
      const [closed] = await db
        .update(orders)
        .set(
          arrived > 0
            ? { state: "owed", receivedZat: arrived, owedZat: arrived, txid: seen?.txid ?? order.txid, seenAt: order.seenAt ?? now }
            : { state: "expired", closedAt: now }
        )
        .where(and(eq(orders.id, order.id), inArray(orders.state, [...OPEN])))
        .returning()
      if (closed) {
        await releaseStock(order)
        return { order: closed, confirmations: 0 }
      }
    } else if (seen?.state === "underpaid" && (order.state !== "underpaid" || arrived !== order.receivedZat)) {
      const [part] = await db
        .update(orders)
        .set({ state: "underpaid", receivedZat: arrived, txid: seen.txid, seenAt: order.seenAt ?? now })
        .where(and(eq(orders.id, order.id), inArray(orders.state, [...OPEN])))
        .returning()
      if (part) return { order: part, confirmations: 0 }
    }
    return { order, confirmations: 0 }
  }

  if (isPaid) {
    const depth = seen?.confirmations ?? 0
    if (depth >= CONFIRMATIONS_NEEDED) return { order: await deliver({ ...order, receivedZat: arrived }, now), confirmations: CONFIRMATIONS_NEEDED }
    if (depth > 0 && order.state === "seen") {
      const [inBlock] = await db
        .update(orders)
        .set({ state: "confirmed", receivedZat: arrived })
        .where(and(eq(orders.id, order.id), eq(orders.state, "seen")))
        .returning()
      if (inBlock) return { order: inBlock, confirmations: depth }
    }
    return { order, confirmations: depth }
  }

  // Handed over already, and more has arrived since (a second payment): the excess is owed back.
  if (lateWatch && order.state === "delivered") {
    const excess = arrived - order.zat
    if (arrived > order.receivedZat) {
      const [more] = await db
        .update(orders)
        .set({ receivedZat: arrived, owedZat: excess > FEE_ZAT ? excess : 0 })
        .where(and(eq(orders.id, order.id), eq(orders.state, "delivered"), isNull(orders.refundedAt)))
        .returning()
      if (more) return { order: more, confirmations: CONFIRMATIONS_NEEDED }
    }
    return { order, confirmations: CONFIRMATIONS_NEEDED }
  }

  // Too late for the item: the stock went back on the shelf when the order expired. What arrived
  // since is owed back, and a later payment adds to it.
  if (lateWatch && arrived > order.owedZat) {
    const [late] = await db
      .update(orders)
      .set({ state: "owed", receivedZat: arrived, owedZat: arrived, txid: seen?.txid ?? order.txid, seenAt: order.seenAt ?? now, closedAt: null })
      .where(and(eq(orders.id, order.id), inArray(orders.state, ["expired", "owed"]), isNull(orders.refundedAt)))
      .returning()
    if (late) return { order: late, confirmations: 0 }
  }

  return { order, confirmations: order.state === "delivered" ? CONFIRMATIONS_NEEDED : 0 }
}

// Moves along every order that only time can move: those whose price lock ran out. An order is
// otherwise only moved when it is read, so a buyer who walked away would keep a code off the shelf
// for good.
//
// With `late`, it also asks the engine about every real order that is over and still watched, so
// that a payment that came late, or twice, is found even if the buyer never opened the order
// again. That is one question to the engine per such order, so it is done where the owner looks
// (the orders and refunds screens), not on every visit to the shop.
export async function sweep(now = Date.now(), late = false) {
  const db = await getDb()
  const overdue = and(inArray(orders.state, [...OPEN]), lt(orders.expiresAt, now))
  const watched = and(
    inArray(orders.state, ["expired", "owed", "delivered"]),
    isNotNull(orders.engineRef),
    isNull(orders.refundedAt),
    gt(orders.expiresAt, now - watchMs())
  )
  const due = await db
    .select()
    .from(orders)
    .where(late ? or(overdue, watched) : overdue)
  for (const order of due) await advance(order, now)
  return due.length
}

// The same for one seller's orders, when that seller looks at their desk: orders whose lock ran
// out are closed, and the ones still watched are asked about, so a payment that came late or
// twice is on the seller's list of what they owe.
export async function sweepSeller(sellerId: string, now = Date.now()) {
  const db = await getDb()
  const due = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.sellerId, sellerId),
        or(
          and(inArray(orders.state, [...OPEN]), lt(orders.expiresAt, now)),
          inArray(orders.state, [...PAID]),
          and(
            inArray(orders.state, ["expired", "owed", "delivered"]),
            isNotNull(orders.engineRef),
            isNull(orders.refundedAt),
            gt(orders.expiresAt, now - watchMs())
          )
        )
      )
    )
  for (const order of due) await advance(order, now)
  return due.length
}

// An item made by a supplier: bought the moment its order is paid, sealed to the buyer's key as
// soon as the supplier hands it over, and never written down here in a form the server can read.
async function deliverSupplied(order: Order, packageCode: string, now: number): Promise<Order> {
  const db = await getDb()
  const owed = async () => {
    const [stuck] = await db
      .update(orders)
      .set({ state: "owed", receivedZat: order.receivedZat, owedZat: order.receivedZat })
      .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID])))
      .returning()
    return stuck ?? (await db.select().from(orders).where(eq(orders.id, order.id)))[0]
  }

  const got = await supply({ orderId: order.id, packageCode, ref: order.supplyRef })
  // Refused: nothing was bought, so all of it is owed back.
  if (got.state === "refused") return owed()
  // The supplier's number for the purchase is kept as soon as there is one.
  if ((got.state === "making" || got.state === "ready") && got.ref !== order.supplyRef) {
    await db.update(orders).set({ supplyRef: got.ref }).where(eq(orders.id, order.id))
    order = { ...order, supplyRef: got.ref }
  }
  if (got.state !== "ready") {
    // Not there yet, or the supplier did not answer. Wait, but not for ever: after half an hour
    // the payment is owed back, and what was bought (if anything) is the owner's to cancel there.
    const since = order.seenAt ?? order.createdAt
    if (now > since + SUPPLY_WAIT_MS) return owed()
    if (order.state === "seen") {
      const [waiting] = await db
        .update(orders)
        .set({ state: "confirmed", receivedZat: order.receivedZat })
        .where(and(eq(orders.id, order.id), eq(orders.state, "seen")))
        .returning()
      if (waiting) return waiting
    }
    return order
  }

  const sealed = await sealTo(JSON.parse(order.publicKey) as PublicKey, got.payload)
  const excess = order.receivedZat - order.zat
  const done = await db
    .update(orders)
    .set({
      state: "delivered",
      sealed: JSON.stringify(sealed),
      deliveredAt: now,
      closedAt: now,
      receivedZat: order.receivedZat,
      owedZat: excess > FEE_ZAT ? excess : 0,
    })
    .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID])))
    .returning()
  // Another request delivered it first: return what it stored.
  return done[0] ?? (await db.select().from(orders).where(eq(orders.id, order.id)))[0]
}

// An item the owner buys by hand. Its payment is three blocks deep: from now the order is on the
// owner's list of things to buy, and not a moment earlier, so nothing is bought before the money
// is in. It waits there until the owner hands the item over (handOver) or says it cannot be
// bought (cannotBuy); after handHours() without either, the payment is owed back.
async function awaitHand(order: Order, now: number): Promise<Order> {
  const db = await getDb()
  if (order.readyAt === null) {
    const [ready] = await db
      .update(orders)
      .set({ state: "confirmed", readyAt: now, receivedZat: order.receivedZat })
      .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID]), isNull(orders.readyAt)))
      .returning()
    return ready ?? (await db.select().from(orders).where(eq(orders.id, order.id)))[0]
  }
  if (now > order.readyAt + handWaitMs()) {
    const [stuck] = await db
      .update(orders)
      .set({ state: "owed", receivedZat: order.receivedZat, owedZat: order.receivedZat })
      .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID])))
      .returning()
    return stuck ?? (await db.select().from(orders).where(eq(orders.id, order.id)))[0]
  }
  return order
}

export const HAND_CODE_MAX = 2000

export type HandResult = { ok: true } | { ok: false; reason: "no-order" | "not-waiting" | "bad-code" }

// The owner bought the item and hands it over: what the owner typed is sealed to the buyer's key
// here and now, and is never written down in a form the server can read. Only for an order that
// is on the owner's list (paid, three blocks deep) and has not been given up on.
export async function handOver(id: string, code: string, now = Date.now()): Promise<HandResult> {
  const db = await getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order) return { ok: false, reason: "no-order" }
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  if (product?.kind !== "hand" || order.readyAt === null || (order.state !== "seen" && order.state !== "confirmed")) {
    return { ok: false, reason: "not-waiting" }
  }
  const item = code.trim()
  if (item.length === 0 || item.length > HAND_CODE_MAX) return { ok: false, reason: "bad-code" }

  const sealed = await sealTo(JSON.parse(order.publicKey) as PublicKey, item)
  const excess = order.receivedZat - order.zat
  const done = await db
    .update(orders)
    .set({
      state: "delivered",
      sealed: JSON.stringify(sealed),
      deliveredAt: now,
      closedAt: now,
      owedZat: excess > FEE_ZAT ? excess : 0,
    })
    .where(and(eq(orders.id, id), inArray(orders.state, [...PAID]), isNotNull(orders.readyAt)))
    .returning({ id: orders.id })
  return done.length > 0 ? { ok: true } : { ok: false, reason: "not-waiting" }
}

// The owner says the item cannot be bought (sold out where the owner buys it, or the price there
// moved): all of the payment is owed back at once, without waiting for the time to run out.
export async function cannotBuy(id: string): Promise<boolean> {
  const db = await getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order || order.readyAt === null) return false
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  if (product?.kind !== "hand") return false
  const stuck = await db
    .update(orders)
    .set({ state: "owed", owedZat: order.receivedZat })
    .where(and(eq(orders.id, id), inArray(orders.state, [...PAID]), isNotNull(orders.readyAt)))
    .returning({ id: orders.id })
  return stuck.length > 0
}

// The orders the owner has to buy an item for: paid, three blocks deep, not handed over yet. Each
// is moved along first, so one whose payment only now became deep enough is on the list, and one
// whose time ran out is off it and owed back.
export async function listToBuy(now = Date.now()) {
  const db = await getDb()
  const paid = await db
    .select({ order: orders })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(inArray(orders.state, [...PAID]), eq(products.kind, "hand")))
  for (const { order } of paid) await advance(order, now)

  const rows = await db
    .select({
      id: orders.id,
      product: products.name,
      priceCents: orders.priceCents,
      zat: orders.zat,
      receivedZat: orders.receivedZat,
      test: orders.test,
      readyAt: sql<number>`${orders.readyAt}`,
    })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(inArray(orders.state, [...PAID]), eq(products.kind, "hand"), isNotNull(orders.readyAt)))
    .orderBy(orders.readyAt)
  return rows.map((row) => ({ ...row, handBy: row.readyAt + handWaitMs() }))
}

// How many orders wait for the owner to buy their item, as last seen: nothing is moved along.
export async function countToBuy() {
  const db = await getDb()
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(inArray(orders.state, [...PAID]), eq(products.kind, "hand"), isNotNull(orders.readyAt)))
  return row?.count ?? 0
}

// Seals the item to the buyer's key, then forgets the readable copy in the same step.
async function deliver(order: Order, now: number): Promise<Order> {
  const db = await getDb()
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  if (product?.kind === "supplier" && product.supplierRef) return deliverSupplied(order, product.supplierRef, now)
  if (product?.kind === "hand") return awaitHand(order, now)

  const [item] = order.stockId
    ? await db.select().from(stock).where(eq(stock.id, order.stockId))
    : []

  // Paid, but there is nothing to hand over: all of it is owed back.
  if (!item?.payload) {
    const [stuck] = await db
      .update(orders)
      .set({ state: "owed", receivedZat: order.receivedZat, owedZat: order.receivedZat })
      .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID])))
      .returning()
    if (stuck) return stuck
    const [current] = await db.select().from(orders).where(eq(orders.id, order.id))
    return current
  }

  const sealed = await sealTo(JSON.parse(order.publicKey) as PublicKey, item.payload)
  // More than the price arrived: the excess is owed back, when it is enough to send at all.
  const excess = order.receivedZat - order.zat

  return db.transaction(async (tx) => {
    const done = await tx
      .update(orders)
      .set({
        state: "delivered",
        sealed: JSON.stringify(sealed),
        deliveredAt: now,
        closedAt: now,
        receivedZat: order.receivedZat,
        owedZat: excess > FEE_ZAT ? excess : 0,
      })
      .where(and(eq(orders.id, order.id), inArray(orders.state, [...PAID])))
      .returning()
    // Another request delivered it first: return what it stored.
    if (done.length === 0) {
      const [current] = await tx.select().from(orders).where(eq(orders.id, order.id))
      return current
    }
    await tx.update(stock).set({ payload: null, state: "given" }).where(eq(stock.id, item.id))
    return done[0]
  })
}

async function releaseStock(order: Pick<Order, "stockId" | "productId">) {
  if (!order.stockId) return
  const db = await getDb()
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  if (product?.kind === "test") {
    await db.delete(stock).where(eq(stock.id, order.stockId))
  } else {
    await db.update(stock).set({ state: "free", orderId: null }).where(eq(stock.id, order.stockId))
  }
}

// Orders that finished or expired long enough ago are deleted, with what was kept for them.
// Never one that is still owed a refund, or whose buyer reported a problem that has no answer
// yet: it stays until the owner has dealt with it.
async function purge(now: number) {
  const db = await getDb()
  const old = await db
    .delete(orders)
    .where(
      and(
        lt(orders.closedAt, now - RETENTION_MS),
        or(eq(orders.owedZat, 0), isNotNull(orders.refundedAt)),
        or(isNull(orders.problem), isNotNull(orders.problemClosedAt))
      )
    )
    .returning({ stockId: orders.stockId })
  const ids = old.map((row) => row.stockId).filter((id): id is number => id !== null)
  if (ids.length > 0) await db.delete(stock).where(and(inArray(stock.id, ids), eq(stock.state, "given")))
}

// Why an order is owed something back, from what is stored about it.
// short: less than the price arrived in time. late: it arrived after the price lock ran out.
// no-item: paid in full and in time, and there was nothing left to hand over. excess: delivered,
// and more than the price was paid.
export type OwedWhy = "short" | "late" | "no-item" | "excess"

export function owedWhy(order: Pick<Order, "state" | "owedZat" | "receivedZat" | "zat" | "seenAt" | "expiresAt">): OwedWhy | null {
  if (order.owedZat <= 0) return null
  if (order.state === "delivered") return "excess"
  // The engine takes a payment as full from 99.5% of the price (its own allowance for rounding).
  if (order.receivedZat < Math.floor(order.zat * 0.995)) return "short"
  if (order.seenAt !== null && order.seenAt > order.expiresAt) return "late"
  return "no-item"
}

// What the order page is shown. No readable item is ever in here: only the sealed copy.
export type OrderView = {
  id: string
  state: Order["state"]
  test: boolean
  // Which money this order is about: none (the stand-in), test coins, or real ZEC.
  network: Network
  product: string
  // Who sells the item, when it is another seller's: the payment goes to that seller's wallet, and
  // whatever is owed back is theirs to send. Null for the shop's own item.
  seller: string | null
  priceCents: number
  zat: number
  // What has arrived so far, and what of it is owed back.
  receivedZat: number
  owedZat: number
  owedWhy: OwedWhy | null
  refunded: boolean
  // The address given for the refund, shortened: whoever has the order's link can tell whether one
  // is on file and recognise their own, and cannot read anyone's address off it.
  refundTo: string | null
  // What was reported about the item that was handed over, and the owner's answer to it. Whoever
  // has the order's link wrote it or was given the link by who did.
  problem: { note: string; at: number; answered: boolean; reply: string | null; refunded: boolean } | null
  // Paid and deep enough, and the supplier is still making the item.
  making: boolean
  // Paid and deep enough, and the owner is buying the item by hand: when it has to be handed over
  // by, after which the payment is owed back. Null for any other order.
  handBy: number | null
  // For a delivered order: the time from which the server may delete it. The link opens nothing
  // once it has, so the page tells whoever holds the item to save it first. It is the earliest
  // time, not the exact one: an order with a refund owed or a report unanswered is kept longer.
  goneAfter: number | null
  address: string
  createdAt: number
  expiresAt: number
  now: number
  confirmations: number
  confirmationsNeeded: number
  wrappedKey: Wrapped
  sealed: Sealed | null
}

export async function readOrder(id: string, now = Date.now()): Promise<OrderView | null> {
  const db = await getDb()
  const [found] = await db.select().from(orders).where(eq(orders.id, id))
  if (!found) return null

  const { order, confirmations } = await advance(found, now)
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  const [seller] = order.sellerId ? await db.select({ name: sellers.name }).from(sellers).where(eq(sellers.id, order.sellerId)) : []

  return {
    id: order.id,
    state: order.state,
    test: order.test,
    // An order says what it was paid in by its address, whatever the server is set to today.
    network: order.test ? "stand-in" : order.address.startsWith("utest") ? "testnet" : "mainnet",
    product: product?.name ?? "Item",
    seller: order.sellerId ? (seller?.name ?? "Another seller") : null,
    priceCents: order.priceCents,
    zat: order.zat,
    receivedZat: order.receivedZat,
    owedZat: order.owedZat,
    owedWhy: owedWhy(order),
    refunded: order.refundedAt !== null,
    refundTo: order.refundAddress ? maskAddress(order.refundAddress) : null,
    problem: order.problem
      ? {
          note: order.problem,
          at: order.problemAt ?? 0,
          answered: order.problemClosedAt !== null,
          reply: order.problemReply,
          refunded: order.problemRefunded === true,
        }
      : null,
    making: product?.kind === "supplier" && order.state === "confirmed" && confirmations >= CONFIRMATIONS_NEEDED,
    handBy: product?.kind === "hand" && order.state === "confirmed" && order.readyAt !== null ? order.readyAt + handWaitMs() : null,
    goneAfter: order.state === "delivered" && order.closedAt !== null ? order.closedAt + RETENTION_MS : null,
    address: order.address,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    now,
    confirmations,
    confirmationsNeeded: CONFIRMATIONS_NEEDED,
    wrappedKey: JSON.parse(order.wrappedKey) as Wrapped,
    sealed: order.sealed ? (JSON.parse(order.sealed) as Sealed) : null,
  }
}

export type AddressResult = { ok: true; refundTo: string } | { ok: false; reason: "no-order" | "nothing-owed" | "bad-address" }

// The buyer says where a refund should go. Taken only for an order that is owed something and has
// not been refunded, and only if it is a shielded address of the order's own network whose
// checksum holds: the refund is sent by hand and cannot be called back. A later address replaces
// an earlier one, until the refund is sent.
export async function setRefundAddress(id: string, text: string): Promise<AddressResult> {
  const db = await getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order) return { ok: false, reason: "no-order" }
  // A test order was paid with nothing, so nothing can be sent back for it.
  if (order.test || order.owedZat <= 0 || order.refundedAt !== null) return { ok: false, reason: "nothing-owed" }

  const address = shieldedAddress(text, order.address.startsWith("utest") ? "testnet" : "mainnet")
  if (!address) return { ok: false, reason: "bad-address" }

  const kept = await db
    .update(orders)
    .set({ refundAddress: address })
    .where(and(eq(orders.id, id), gt(orders.owedZat, 0), isNull(orders.refundedAt)))
    .returning({ id: orders.id })
  return kept.length > 0 ? { ok: true, refundTo: maskAddress(address) } : { ok: false, reason: "nothing-owed" }
}

export type ProblemResult =
  | { ok: true }
  | { ok: false; reason: "no-order" | "not-delivered" | "answered" | "bad-note" | "bad-address" }

// The buyer says that the item they were handed does not work: what is wrong, and where a refund
// would go. Taken only for an order that was paid with real coins and handed over, and only until
// the owner has answered; a later report replaces an earlier one. Nothing is decided here: the
// owner reads it and answers by hand (lib/admin.ts).
export async function reportProblem(id: string, note: string, addressText: string, now = Date.now()): Promise<ProblemResult> {
  const db = await getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order) return { ok: false, reason: "no-order" }
  // A test order handed over a made-up item, paid with nothing.
  if (order.test || order.state !== "delivered") return { ok: false, reason: "not-delivered" }
  if (order.problemClosedAt !== null) return { ok: false, reason: "answered" }

  const text = note.trim()
  if (text.length < PROBLEM_MIN || text.length > PROBLEM_MAX) return { ok: false, reason: "bad-note" }
  const address = shieldedAddress(addressText, order.address.startsWith("utest") ? "testnet" : "mainnet")
  if (!address) return { ok: false, reason: "bad-address" }

  const kept = await db
    .update(orders)
    .set({ problem: text, problemAt: now, refundAddress: address })
    .where(and(eq(orders.id, id), eq(orders.state, "delivered"), isNull(orders.problemClosedAt)))
    .returning({ id: orders.id })
  return kept.length > 0 ? { ok: true } : { ok: false, reason: "answered" }
}

export type ShelfItem = {
  slug: string
  name: string
  blurb: string
  priceCents: number
  kind: "test" | "stock" | "supplier" | "hand"
  left: number | null
  // The shelf it stands on, if the owner put it on one.
  shelf: ShelfSlug | null
  // Who sells it, when it is another seller's item. Null for the shop's own.
  seller: string | null
  // That seller's own page (/s/<slug>), where all their items are.
  sellerSlug: string | null
}

// What is on sale right now. `left` is null for an item that does not run out: a test item, one
// the owner buys by hand once it is paid for, and one a supplier makes to order. The second is only on sale where real payments are taken and the
// server has the key to the supplier; whether the supplier can make it is asked at checkout.
export async function listItems(now = Date.now()): Promise<ShelfItem[]> {
  const db = await getDb()
  await sweep(now)
  // A made-up item is not shown where real money is taken: it could only be refused.
  const real = engine().network === "mainnet"
  const made = engine().network !== "stand-in" && supplierOn()
  // Another seller's item is on the shelf only while selling is open, the seller was not closed,
  // the item was not taken down and the seller's key is of the network payments run on.
  const selling = sellingOn()
  const network = engine().network
  const sellerRows = selling ? await db.select().from(sellers) : []
  const sellerOf = new Map(sellerRows.filter((row) => row.closedAt === null && row.network === network).map((row) => [row.id, row]))
  const rows = (await db.select().from(products).where(eq(products.active, true))).filter(
    (row) =>
      !(real && row.kind === "test") &&
      !(row.kind === "supplier" && !(made && row.supplierRef)) &&
      (row.sellerId === null || (row.kind === "stock" && row.takenDownAt === null && sellerOf.has(row.sellerId)))
  )
  const free = await db
    .select({ productId: stock.productId, count: sql<number>`count(*)` })
    .from(stock)
    .where(eq(stock.state, "free"))
    .groupBy(stock.productId)
  const left = new Map(free.map((row) => [row.productId, row.count]))
  // An item the owner put on no shelf is on the eSIM shelf if that is plainly what it is: made by
  // the eSIM supplier, or with a code in stock that is an eSIM's activation code.
  const esimCodes = await db
    .selectDistinct({ productId: stock.productId })
    .from(stock)
    .where(and(eq(stock.state, "free"), sql`${stock.payload} like 'LPA:%'`))
  const esim = new Set(esimCodes.map((row) => row.productId))
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    priceCents: row.priceCents,
    kind: row.kind,
    left: row.kind === "stock" ? (left.get(row.id) ?? 0) : null,
    shelf: row.shelf ?? (row.kind === "supplier" || esim.has(row.id) ? "esim" : null),
    seller: row.sellerId ? (sellerOf.get(row.sellerId)?.name ?? null) : null,
    sellerSlug: row.sellerId ? (sellerOf.get(row.sellerId)?.slug ?? null) : null,
  }))
}

// One item on sale, by the name in its link. Null when there is none, or it is off the shelf.
export async function getItem(slug: string, now = Date.now()): Promise<ShelfItem | null> {
  return (await listItems(now)).find((item) => item.slug === slug) ?? null
}
