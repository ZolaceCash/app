import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import type { Order, Product } from "@/lib/db/schema"
import { sweep } from "@/lib/orders"

const { orders, products, stock } = schema

// What the owner's screens read and change. Nothing here checks who is asking: every caller in
// app/owner does that first (lib/owner-session.ts). No function returns a code from the stock or
// anything about a buyer, because the owner's screens have no use for either.

export type OwnerOrder = {
  id: string
  product: string
  state: Order["state"]
  test: boolean
  priceCents: number
  zat: number
  createdAt: number
  seenAt: number | null
  closedAt: number | null
}

const orderColumns = {
  id: orders.id,
  product: sql<string>`coalesce(${products.name}, 'Item')`,
  state: orders.state,
  test: orders.test,
  priceCents: orders.priceCents,
  zat: orders.zat,
  createdAt: orders.createdAt,
  seenAt: orders.seenAt,
  closedAt: orders.closedAt,
}

// The newest orders. Overdue ones are closed first, so none is shown as waiting after its time.
export async function listOrders(now = Date.now(), limit = 200): Promise<OwnerOrder[]> {
  await sweep(now)
  const db = await getDb()
  return db
    .select(orderColumns)
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}

export async function countOrders(): Promise<Partial<Record<Order["state"], number>>> {
  const db = await getDb()
  const rows = await db
    .select({ state: orders.state, count: sql<number>`count(*)` })
    .from(orders)
    .groupBy(orders.state)
  return Object.fromEntries(rows.map((row) => [row.state, row.count]))
}

// Orders that were paid and could not be delivered. An order rests in "confirmed" only then
// (lib/orders.ts, deliver), so that state is the refund queue. Oldest first: they waited longest.
export async function listRefundsDue(): Promise<OwnerOrder[]> {
  const db = await getDb()
  return db
    .select(orderColumns)
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.state, "confirmed"))
    .orderBy(asc(orders.seenAt))
}

// The owner sent the refund by hand, from the owner's own wallet, and says so here. The server
// sends nothing: this only takes the order off the queue.
export async function markRefunded(id: string, now = Date.now()) {
  const db = await getDb()
  const done = await db
    .update(orders)
    .set({ state: "refunded", closedAt: now })
    .where(and(eq(orders.id, id), eq(orders.state, "confirmed")))
    .returning({ stockId: orders.stockId })
  if (done.length === 0) return false
  // What was set aside for it had nothing in it: drop the empty row.
  const stockId = done[0].stockId
  if (stockId !== null) await db.delete(stock).where(and(eq(stock.id, stockId), isNull(stock.payload)))
  return true
}

export type OwnerProduct = Product & { free: number; held: number; given: number }

export async function listProducts(): Promise<OwnerProduct[]> {
  const db = await getDb()
  const rows = await db.select().from(products).orderBy(asc(products.id))
  const counts = await db
    .select({ productId: stock.productId, state: stock.state, count: sql<number>`count(*)` })
    .from(stock)
    .groupBy(stock.productId, stock.state)
  return rows.map((row) => {
    const of = (state: "free" | "held" | "given") =>
      counts.find((count) => count.productId === row.id && count.state === state)?.count ?? 0
    return { ...row, free: of("free"), held: of("held"), given: of("given") }
  })
}

export type ProductInput = { name: string; blurb: string; priceCents: number }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// A price as the owner types it ("12", "12.5", "12.50") in cents, or null when it is not one.
export function parsePrice(text: string) {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text.trim())) return null
  const cents = Math.round(Number(text) * 100)
  return cents > 0 ? cents : null
}

function checkProduct(input: ProductInput) {
  if (input.name.length < 1 || input.name.length > 80) return "The name has to be 1 to 80 characters."
  if (input.blurb.length > 200) return "The line about the item has to be 200 characters or fewer."
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) return "The price has to be more than zero."
  return null
}

export type Result = { ok: true } | { ok: false; error: string }

// A new item, always of the kind that is handed over from uploaded codes. It starts off the shelf:
// with no codes yet it could not be ordered anyway.
export async function createProduct(input: ProductInput & { slug: string }): Promise<Result> {
  if (input.slug.length > 60 || !SLUG.test(input.slug)) {
    return { ok: false, error: "The link name has to be lower-case letters, digits and single dashes." }
  }
  const wrong = checkProduct(input)
  if (wrong) return { ok: false, error: wrong }

  const db = await getDb()
  const made = await db
    .insert(products)
    .values({ ...input, kind: "stock", active: false })
    .onConflictDoNothing({ target: products.slug })
    .returning({ id: products.id })
  return made.length > 0 ? { ok: true } : { ok: false, error: "Another item already has that link name." }
}

export async function updateProduct(id: number, input: ProductInput & { active: boolean }): Promise<Result> {
  const wrong = checkProduct(input)
  if (wrong) return { ok: false, error: wrong }

  const db = await getDb()
  const changed = await db
    .update(products)
    .set({ name: input.name, blurb: input.blurb, priceCents: input.priceCents, active: input.active })
    .where(eq(products.id, id))
    .returning({ id: products.id })
  return changed.length > 0 ? { ok: true } : { ok: false, error: "There is no such item." }
}

export const MAX_CODES_AT_ONCE = 5000

// Puts codes on a shelf, one per line of what the owner pasted. The same thing as
// `npm run stock`, from a screen. Empty lines are skipped. A code is not checked against the ones
// already on the shelf: pasting the same list twice puts it there twice.
export async function addStock(productId: number, text: string): Promise<Result & { added?: number }> {
  const codes = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (codes.length === 0) return { ok: false, error: "There are no codes in what was pasted." }
  if (codes.length > MAX_CODES_AT_ONCE) {
    return { ok: false, error: `That is more than ${MAX_CODES_AT_ONCE} codes at once. Split it up.` }
  }
  if (codes.some((code) => code.length > 2000)) return { ok: false, error: "One of the codes is too long." }

  const db = await getDb()
  const [product] = await db.select().from(products).where(eq(products.id, productId))
  if (!product) return { ok: false, error: "There is no such item." }
  if (product.kind !== "stock") {
    return { ok: false, error: "A test item makes up its codes at checkout. It takes no stock." }
  }

  // In batches: one statement can only carry so many values.
  for (let at = 0; at < codes.length; at += 200) {
    await db.insert(stock).values(codes.slice(at, at + 200).map((payload) => ({ productId, payload })))
  }
  return { ok: true, added: codes.length }
}
