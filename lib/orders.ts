import { and, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import type { Order } from "@/lib/db/schema"
import { LOCK_MS } from "@/lib/order-times"
import { CONFIRMATIONS_NEEDED, engine, FEE_ZAT, type Network, type Seen } from "@/lib/payment"
import { quoteZec } from "@/lib/price"
import { sealTo, type PublicKey, type Sealed, type Wrapped } from "@/lib/seal"
import { canSupply, supplierOn, supply } from "@/lib/supplier"
import { maskAddress, shieldedAddress } from "@/lib/zcash-address"

const { orders, products, stock } = schema

export { LOCK_MS }

// How long a paid order waits for a supplier to make its item before it is given up on and owed
// back. The supplier says an eSIM takes up to half a minute; this is for the day it does not come.
export const SUPPLY_WAIT_MS = 30 * 60 * 1000

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

  // An engine that cannot be trusted to see a payment takes no order: a buyer would pay into silence.
  if (!(await pay.healthy())) return { ok: false, reason: "no-engine" }

  const quote = await quoteZec(now)
  if (!quote.ok) return { ok: false, reason: quote.reason === "disagree" ? "price-disagree" : "no-price" }

  // Codes held by orders that ran out of time go back on the shelf before one is looked for.
  await sweep(now)

  const id = newId()

  // Set an item aside for this order: a fresh made-up code for a test product, otherwise one
  // free code from the stock, claimed only if nobody else took it in the meantime. An item a
  // supplier makes has nothing to set aside: it is bought when the order is paid.
  let stockId: number | null
  if (product.kind === "supplier") {
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
  const opened = await pay.open({ orderId: id, priceCents: product.priceCents, usdPerZec: quote.usdPerZec })
  if (!opened.ok) {
    await releaseStock({ stockId, productId: product.id })
    return { ok: false, reason: opened.reason === "price-disagree" ? "price-disagree" : "no-engine" }
  }

  await db.insert(orders).values({
    id,
    productId: product.id,
    stockId,
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

// Seals the item to the buyer's key, then forgets the readable copy in the same step.
async function deliver(order: Order, now: number): Promise<Order> {
  const db = await getDb()
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  if (product?.kind === "supplier" && product.supplierRef) return deliverSupplied(order, product.supplierRef, now)

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
// Never one that is still owed a refund: it stays until the owner has sent it.
async function purge(now: number) {
  const db = await getDb()
  const old = await db
    .delete(orders)
    .where(and(lt(orders.closedAt, now - RETENTION_MS), or(eq(orders.owedZat, 0), isNotNull(orders.refundedAt))))
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
  // Paid and deep enough, and the supplier is still making the item.
  making: boolean
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

  return {
    id: order.id,
    state: order.state,
    test: order.test,
    // An order says what it was paid in by its address, whatever the server is set to today.
    network: order.test ? "stand-in" : order.address.startsWith("utest") ? "testnet" : "mainnet",
    product: product?.name ?? "Item",
    priceCents: order.priceCents,
    zat: order.zat,
    receivedZat: order.receivedZat,
    owedZat: order.owedZat,
    owedWhy: owedWhy(order),
    refunded: order.refundedAt !== null,
    refundTo: order.refundAddress ? maskAddress(order.refundAddress) : null,
    making: product?.kind === "supplier" && order.state === "confirmed" && confirmations >= CONFIRMATIONS_NEEDED,
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

export type ShelfItem = { slug: string; name: string; blurb: string; priceCents: number; kind: "test" | "stock" | "supplier"; left: number | null }

// What is on sale right now. `left` is null for an item that does not run out: a test item, and
// one a supplier makes to order. The second is only on sale where real payments are taken and the
// server has the key to the supplier; whether the supplier can make it is asked at checkout.
export async function listItems(now = Date.now()): Promise<ShelfItem[]> {
  const db = await getDb()
  await sweep(now)
  // A made-up item is not shown where real money is taken: it could only be refused.
  const real = engine().network === "mainnet"
  const made = engine().network !== "stand-in" && supplierOn()
  const rows = (await db.select().from(products).where(eq(products.active, true))).filter(
    (row) => !(real && row.kind === "test") && !(row.kind === "supplier" && !(made && row.supplierRef))
  )
  const free = await db
    .select({ productId: stock.productId, count: sql<number>`count(*)` })
    .from(stock)
    .where(eq(stock.state, "free"))
    .groupBy(stock.productId)
  const left = new Map(free.map((row) => [row.productId, row.count]))
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    priceCents: row.priceCents,
    kind: row.kind,
    left: row.kind === "stock" ? (left.get(row.id) ?? 0) : null,
  }))
}

// One item on sale, by the name in its link. Null when there is none, or it is off the shelf.
export async function getItem(slug: string, now = Date.now()): Promise<ShelfItem | null> {
  return (await listItems(now)).find((item) => item.slug === slug) ?? null
}
