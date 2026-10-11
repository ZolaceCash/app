import { and, eq, inArray, lt, sql } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import type { Order } from "@/lib/db/schema"
import { CONFIRMATIONS_NEEDED, engine } from "@/lib/payment"
import { quoteZec, toZat } from "@/lib/price"
import { sealTo, type PublicKey, type Sealed, type Wrapped } from "@/lib/seal"

const { orders, products, stock } = schema

// PLAN.md: the price is locked for 15 minutes.
export const LOCK_MS = 15 * 60 * 1000

// PLAN.md says orders are deleted "some days" after they are done and leaves the number open.
// Seven is a placeholder until the owner fixes it; ORDER_RETENTION_DAYS overrides it.
const RETENTION_MS = Number(process.env.ORDER_RETENTION_DAYS ?? 7) * 24 * 60 * 60 * 1000

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no-product" | "no-stock" | "no-price" | "price-disagree" }

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

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, input.slug), eq(products.active, true)))
  if (!product) return { ok: false, reason: "no-product" }

  const quote = await quoteZec(now)
  if (!quote.ok) return { ok: false, reason: quote.reason === "disagree" ? "price-disagree" : "no-price" }

  // Codes held by orders that ran out of time go back on the shelf before one is looked for.
  await sweep(now)

  const id = newId()
  const address = await engine.createAddress(id)

  // Set an item aside for this order: a fresh made-up code for a test product, otherwise one
  // free code from the stock, claimed only if nobody else took it in the meantime.
  let stockId: number
  if (product.kind === "test") {
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

  await db.insert(orders).values({
    id,
    productId: product.id,
    stockId,
    state: "waiting",
    priceCents: product.priceCents,
    zat: toZat(product.priceCents, quote.usdPerZec),
    address,
    publicKey: JSON.stringify(input.publicKey),
    wrappedKey: JSON.stringify(input.wrappedKey),
    test: engine.test,
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

// Moves an order along as far as time and the payment engine allow, and returns it.
// Called whenever an order is read, so nothing has to run in the background.
async function advance(order: Order, now: number): Promise<Order> {
  const db = await getDb()

  if (order.state === "waiting" && now > order.expiresAt) {
    const expired = await db
      .update(orders)
      .set({ state: "expired", closedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.state, "waiting")))
      .returning()
    if (expired.length > 0) {
      await releaseStock(order)
      return expired[0]
    }
  }

  if (order.state === "seen" || order.state === "confirmed") {
    const depth = await engine.confirmations(
      { orderId: order.id, address: order.address, zat: order.zat, seenAt: order.seenAt },
      now
    )
    if (depth >= CONFIRMATIONS_NEEDED) return deliver(order, now)
  }

  return order
}

// Closes every order whose price lock ran out. An order is otherwise only moved along when it is
// read, so a buyer who walked away would keep a code off the shelf for good.
export async function sweep(now = Date.now()) {
  const db = await getDb()
  const overdue = await db
    .select()
    .from(orders)
    .where(and(eq(orders.state, "waiting"), lt(orders.expiresAt, now)))
  for (const order of overdue) await advance(order, now)
  return overdue.length
}

// Seals the item to the buyer's key, then forgets the readable copy in the same step.
async function deliver(order: Order, now: number): Promise<Order> {
  const db = await getDb()
  const [item] = order.stockId
    ? await db.select().from(stock).where(eq(stock.id, order.stockId))
    : []

  // Paid, but there is nothing to hand over: the order stays "confirmed" and is owed a refund.
  if (!item?.payload) {
    const [stuck] = await db
      .update(orders)
      .set({ state: "confirmed" })
      .where(eq(orders.id, order.id))
      .returning()
    return stuck
  }

  const sealed = await sealTo(JSON.parse(order.publicKey) as PublicKey, item.payload)

  return db.transaction(async (tx) => {
    const done = await tx
      .update(orders)
      .set({ state: "delivered", sealed: JSON.stringify(sealed), deliveredAt: now, closedAt: now })
      .where(and(eq(orders.id, order.id), inArray(orders.state, ["seen", "confirmed"])))
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

async function releaseStock(order: Order) {
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
async function purge(now: number) {
  const db = await getDb()
  const old = await db
    .delete(orders)
    .where(lt(orders.closedAt, now - RETENTION_MS))
    .returning({ stockId: orders.stockId })
  const ids = old.map((row) => row.stockId).filter((id): id is number => id !== null)
  if (ids.length > 0) await db.delete(stock).where(and(inArray(stock.id, ids), eq(stock.state, "given")))
}

// What the order page is shown. No readable item is ever in here: only the sealed copy.
export type OrderView = {
  id: string
  state: Order["state"]
  test: boolean
  product: string
  priceCents: number
  zat: number
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

  const order = await advance(found, now)
  const [product] = await db.select().from(products).where(eq(products.id, order.productId))
  const confirmations =
    order.state === "delivered"
      ? CONFIRMATIONS_NEEDED
      : await engine.confirmations(
          { orderId: order.id, address: order.address, zat: order.zat, seenAt: order.seenAt },
          now
        )

  return {
    id: order.id,
    state: order.state,
    test: order.test,
    product: product?.name ?? "Item",
    priceCents: order.priceCents,
    zat: order.zat,
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

export type ShelfItem = { slug: string; name: string; blurb: string; priceCents: number; kind: "test" | "stock"; left: number | null }

// What is on sale right now. `left` is null for a test item, which never runs out.
export async function listItems(now = Date.now()): Promise<ShelfItem[]> {
  const db = await getDb()
  await sweep(now)
  const rows = await db.select().from(products).where(eq(products.active, true))
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
    left: row.kind === "test" ? null : (left.get(row.id) ?? 0),
  }))
}

// One item on sale, by the name in its link. Null when there is none, or it is off the shelf.
export async function getItem(slug: string, now = Date.now()): Promise<ShelfItem | null> {
  return (await listItems(now)).find((item) => item.slug === slug) ?? null
}
