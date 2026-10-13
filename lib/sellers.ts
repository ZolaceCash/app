import { createHash, randomBytes } from "node:crypto"

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { parsePrice, parseShelf, REPLY_MAX } from "@/lib/admin"
import { getDb, schema } from "@/lib/db"
import type { Order, Seller, ShelfSlug } from "@/lib/db/schema"
import { listItems, owedWhy, sweepSeller, type OwedWhy, type ShelfItem } from "@/lib/orders"
import { engine, forgetViewingKey, registerViewingKey } from "@/lib/payment"
import { noticeWhere } from "@/lib/seller-notify"
import { sellerLimits, sellingOn } from "@/lib/selling"
import { viewingKey } from "@/lib/zcash-address"

const { orders, products, sellers, stock } = schema

// Other sellers (PLAN.md, "Other sellers"). A seller gives the shop a viewing key; an order of
// their item gets an address made from it and is paid straight to their wallet. The shop never
// holds that money and cannot send any of it back: what such an order is owed is the seller's to
// send, and a buyer's report is the seller's to answer.
//
// There is no account. A seller is whoever holds the secret of their link. The site keeps a hash
// of that secret and not the secret; it keeps the key the payment engine gave for the seller and
// not the viewing key, which goes to the engine and nowhere else. No function here returns a code
// from the stock.

export type Result = { ok: true } | { ok: false; error: string }

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&'_-]{1,39}$/u
const tidy = (text: string) => text.trim().replace(/\s+/g, " ")
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex")
const newId = () => randomBytes(12).toString("hex")

// A name in plain letters for a link, with a few random characters behind it so that no two are
// alike: two sellers may choose the same name, and two items of one seller too.
const linkName = (name: string, fallback: string, random: number) => {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return `${base || fallback}-${randomBytes(random).toString("hex")}`
}

export type Joined =
  | { ok: true; token: string }
  | { ok: false; reason: "closed" | "bad-name" | "not-agreed" | "bad-key" | "taken" | "busy" | "full" | "unavailable" }

// A new seller. The viewing key is checked for its shape and its network here, then handed to the
// payment engine, which says whether it can use it. The secret of the seller's link is made here
// and returned once: it is the only way back to what they list.
export async function join(input: { name: string; viewingKey: string; agreed: boolean }, now = Date.now()): Promise<Joined> {
  if (!sellingOn()) return { ok: false, reason: "closed" }
  const name = tidy(input.name)
  // A seller may not pass for the shop itself.
  if (!NAME.test(name) || /zolace/i.test(name.replace(/[^\p{L}\p{N}]/gu, ""))) return { ok: false, reason: "bad-name" }
  if (!input.agreed) return { ok: false, reason: "not-agreed" }

  const network = engine().network
  if (network === "stand-in") return { ok: false, reason: "closed" }
  const key = viewingKey(input.viewingKey, network)
  if (!key) return { ok: false, reason: "bad-key" }

  const db = await getDb()
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(sellers).where(isNull(sellers.closedAt))
  if (count >= sellerLimits().sellers) return { ok: false, reason: "full" }

  const registered = await registerViewingKey(key)
  if (!registered.ok) return { ok: false, reason: registered.reason === "refused" ? "bad-key" : registered.reason }

  const token = randomBytes(32).toString("base64url")
  await db
    .insert(sellers)
    .values({ id: newId(), name, slug: linkName(name, "seller", 3), tokenHash: hashOf(token), engineKey: registered.key, network, createdAt: now })
  return { ok: true, token }
}

// Who holds this secret. Null for anything that is not a seller's secret.
export async function sellerOf(token: string): Promise<Seller | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const db = await getDb()
  const [seller] = await db.select().from(sellers).where(eq(sellers.tokenHash, hashOf(token)))
  return seller ?? null
}

// ---------------------------------------------------------------- the seller's items

export const CODES_AT_ONCE = 500
export const CODES_ON_SHELF = 2000

export type ItemInput = { name: string; blurb: string; price: string; shelf: string }

function checkItem(input: ItemInput): { ok: true; name: string; blurb: string; priceCents: number; shelf: ShelfSlug | null } | { ok: false; error: string } {
  const name = tidy(input.name)
  const blurb = tidy(input.blurb)
  if (name.length < 1 || name.length > 80) return { ok: false, error: "The name has to be 1 to 80 characters." }
  if (blurb.length > 200) return { ok: false, error: "The line about the item has to be 200 characters or fewer." }
  const priceCents = parsePrice(input.price.trim().replace(/^\$/, ""))
  const most = sellerLimits().maxPriceCents
  if (priceCents === null) return { ok: false, error: "The price has to be an amount in dollars, like 12 or 12.50." }
  if (priceCents > most) return { ok: false, error: `An item here costs at most $${(most / 100).toFixed(2)}.` }
  const shelf = parseShelf(input.shelf)
  if (shelf === undefined) return { ok: false, error: "There is no such shelf." }
  return { ok: true, name, blurb, priceCents, shelf }
}

// The item's name in links: its own name in plain letters, and a few random characters so that no
// two items share one and a seller cannot take a name the shop uses.
const slugFor = (name: string) => linkName(name, "item", 4)

const CLOSED = "The shop has closed this seller. Nothing can be listed."
const LEFT = "You stopped selling here. To sell again, sign up again."
// Why this seller can list nothing, or null when they can.
const shut = (seller: Seller) => (seller.leftAt !== null ? LEFT : seller.closedAt !== null ? CLOSED : null)

// A new item of this seller's. It starts off the shelf, so codes can be put in before anyone can
// order it.
export async function addItem(seller: Seller, input: ItemInput): Promise<Result> {
  const why = shut(seller)
  if (why) return { ok: false, error: why }
  const item = checkItem(input)
  if (!item.ok) return item

  const db = await getDb()
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.sellerId, seller.id))
  const most = sellerLimits().maxItems
  if (count >= most) return { ok: false, error: `A seller has at most ${most} items. Change one you have instead.` }

  await db.insert(products).values({
    slug: slugFor(item.name),
    name: item.name,
    blurb: item.blurb,
    priceCents: item.priceCents,
    kind: "stock",
    shelf: item.shelf,
    active: false,
    sellerId: seller.id,
  })
  return { ok: true }
}

// Only an item of this seller's is ever found by these.
const mine = (seller: Seller, id: number) => and(eq(products.id, id), eq(products.sellerId, seller.id))

export async function saveItem(seller: Seller, id: number, input: ItemInput & { active: boolean }): Promise<Result> {
  const why = shut(seller)
  if (why) return { ok: false, error: why }
  const item = checkItem(input)
  if (!item.ok) return item

  const db = await getDb()
  const [found] = await db.select().from(products).where(mine(seller, id))
  if (!found) return { ok: false, error: "There is no such item." }
  if (found.takenDownAt !== null && input.active) return { ok: false, error: "The shop took this item down. It cannot go back on the shelf." }

  await db
    .update(products)
    .set({ name: item.name, blurb: item.blurb, priceCents: item.priceCents, shelf: item.shelf, active: input.active })
    .where(mine(seller, id))
  return { ok: true }
}

// Puts codes behind an item, one per line of what the seller pasted. Each is kept readable until
// its order is paid, then sealed to the buyer and wiped.
export async function addCodes(seller: Seller, id: number, text: string): Promise<Result & { added?: number }> {
  const why = shut(seller)
  if (why) return { ok: false, error: why }
  const codes = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (codes.length === 0) return { ok: false, error: "There are no codes in what was pasted." }
  if (codes.length > CODES_AT_ONCE) return { ok: false, error: `That is more than ${CODES_AT_ONCE} codes at once. Split it up.` }
  if (codes.some((code) => code.length > 2000)) return { ok: false, error: "One of the codes is too long." }

  const db = await getDb()
  const [found] = await db.select().from(products).where(mine(seller, id))
  if (!found) return { ok: false, error: "There is no such item." }
  if (found.takenDownAt !== null) return { ok: false, error: "The shop took this item down. It takes no codes." }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(stock)
    .where(and(eq(stock.productId, id), eq(stock.state, "free")))
  if (count + codes.length > CODES_ON_SHELF) return { ok: false, error: `An item holds at most ${CODES_ON_SHELF} unsold codes.` }

  for (let at = 0; at < codes.length; at += 200) {
    await db.insert(stock).values(codes.slice(at, at + 200).map((payload) => ({ productId: id, payload })))
  }
  return { ok: true, added: codes.length }
}

// Takes back every code of an item that is not sold and not set aside for an order. They are
// deleted, not shown: the seller has them already.
export async function clearCodes(seller: Seller, id: number): Promise<Result & { removed?: number }> {
  const db = await getDb()
  const [found] = await db.select({ id: products.id }).from(products).where(mine(seller, id))
  if (!found) return { ok: false, error: "There is no such item." }
  const gone = await db
    .delete(stock)
    .where(and(eq(stock.productId, id), eq(stock.state, "free")))
    .returning({ id: stock.id })
  return { ok: true, removed: gone.length }
}

// ---------------------------------------------------------------- the seller's orders

// An order as its seller names it. Not the order's own id: that is the first half of the buyer's
// link, and whoever has it can read the order's page and leave a refund address on it.
export const refOf = (orderId: string) => createHash("sha256").update(`seller-ref:${orderId}`).digest("hex").slice(0, 12)

export type DeskOrder = {
  ref: string
  product: string
  state: Order["state"]
  priceCents: number
  zat: number
  receivedZat: number
  // What this seller owes the buyer for it, and why. Zero: nothing.
  owedZat: number
  owedWhy: OwedWhy | null
  refunded: boolean
  // Where the buyer asked for it to be sent. Only there while something is owed or reported.
  refundAddress: string | null
  createdAt: number
  deliveredAt: number | null
  problem: { note: string; at: number; answered: boolean; reply: string | null; refunded: boolean } | null
}

export type DeskItem = {
  id: number
  slug: string
  name: string
  blurb: string
  priceCents: number
  shelf: ShelfSlug | null
  active: boolean
  takenDown: boolean
  free: number
  held: number
  given: number
}

export type Desk = {
  name: string
  // The seller's own page, to share: /s/<page>. Null for a seller without one.
  page: string | null
  // Which notification service the seller is told through, by its name. Null: none. The address
  // itself is never sent back to the desk.
  notice: string | null
  network: "testnet" | "mainnet"
  // Selling is open on this server and this seller's key is of the network payments run on.
  open: boolean
  closed: boolean
  // The seller stopped selling here themselves: when. Null while they sell.
  left: number | null
  limits: { maxPriceCents: number; maxItems: number }
  items: DeskItem[]
  orders: DeskOrder[]
}

// Everything the seller's desk shows: their items with how many codes each has, and their orders
// with what is owed on them and what buyers reported. Their orders are moved along first, so a
// payment that came late is on the list.
export async function desk(seller: Seller, now = Date.now()): Promise<Desk> {
  await sweepSeller(seller.id, now)
  const db = await getDb()

  const rows = await db.select().from(products).where(eq(products.sellerId, seller.id)).orderBy(asc(products.id))
  const counts = await db
    .select({ productId: stock.productId, state: stock.state, count: sql<number>`count(*)` })
    .from(stock)
    .innerJoin(products, eq(stock.productId, products.id))
    .where(eq(products.sellerId, seller.id))
    .groupBy(stock.productId, stock.state)
  const of = (id: number, state: "free" | "held" | "given") => counts.find((row) => row.productId === id && row.state === state)?.count ?? 0

  const placed = await db
    .select({ order: orders, product: sql<string>`coalesce(${products.name}, 'Item')` })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.sellerId, seller.id))
    .orderBy(desc(orders.createdAt))
    .limit(100)

  const limits = sellerLimits()
  return {
    name: seller.name,
    page: seller.slug,
    notice: noticeWhere(seller.notifyUrl),
    network: seller.network,
    open: sellingOn() && engine().network === seller.network && seller.leftAt === null,
    closed: seller.closedAt !== null,
    left: seller.leftAt,
    limits: { maxPriceCents: limits.maxPriceCents, maxItems: limits.maxItems },
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      blurb: row.blurb,
      priceCents: row.priceCents,
      shelf: row.shelf,
      active: row.active,
      takenDown: row.takenDownAt !== null,
      free: of(row.id, "free"),
      held: of(row.id, "held"),
      given: of(row.id, "given"),
    })),
    orders: placed.map(({ order, product }) => {
      const open = (order.owedZat > 0 && order.refundedAt === null) || (order.problem !== null && order.problemClosedAt === null)
      return {
        ref: refOf(order.id),
        product,
        state: order.state,
        priceCents: order.priceCents,
        zat: order.zat,
        receivedZat: order.receivedZat,
        owedZat: order.owedZat,
        owedWhy: owedWhy(order),
        refunded: order.refundedAt !== null,
        refundAddress: open ? order.refundAddress : null,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
        problem: order.problem
          ? {
              note: order.problem,
              at: order.problemAt ?? 0,
              answered: order.problemClosedAt !== null,
              reply: order.problemReply,
              refunded: order.problemRefunded === true,
            }
          : null,
      }
    }),
  }
}

// One of this seller's orders, by the seller's name for it.
async function orderOf(seller: Seller, ref: string) {
  if (!/^[0-9a-f]{12}$/.test(ref)) return null
  const db = await getDb()
  const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.sellerId, seller.id))
  return rows.find((row) => refOf(row.id) === ref)?.id ?? null
}

// The seller sent what an order was owed, from their own wallet, and says so here. Nothing is
// sent by the server: it only records that the seller said so, and the buyer's page shows it.
export async function sellerRefunded(seller: Seller, ref: string, now = Date.now()): Promise<Result> {
  const id = await orderOf(seller, ref)
  const db = await getDb()
  const done = id
    ? await db
        .update(orders)
        .set({ refundedAt: now, state: sql`case when ${orders.state} = 'owed' then 'refunded' else ${orders.state} end`, closedAt: sql`coalesce(${orders.closedAt}, ${now})` })
        .where(and(eq(orders.id, id), eq(orders.sellerId, seller.id), gt(orders.owedZat, 0), isNull(orders.refundedAt)))
        .returning({ stockId: orders.stockId })
    : []
  if (done.length === 0) return { ok: false, error: "That order is not waiting for a refund any more." }
  // What was set aside for it and never handed over had nothing in it: drop the empty row. A code
  // that was handed over stays counted as such.
  const stockId = done[0].stockId
  if (stockId !== null) await db.delete(stock).where(and(eq(stock.id, stockId), isNull(stock.payload), ne(stock.state, "given")))
  return { ok: true }
}

// The seller answers a buyer's report: with a refund they sent, or without one, and with a line
// the buyer reads on the order's page.
export async function sellerAnswer(seller: Seller, ref: string, answer: { refunded: boolean; reply: string }, now = Date.now()): Promise<Result> {
  const reply = answer.reply.trim()
  if (reply.length > REPLY_MAX) return { ok: false, error: `The answer has to be ${REPLY_MAX} characters or fewer.` }
  const id = await orderOf(seller, ref)
  const db = await getDb()
  const done = id
    ? await db
        .update(orders)
        .set({ problemClosedAt: now, problemReply: reply || null, problemRefunded: answer.refunded })
        .where(and(eq(orders.id, id), eq(orders.sellerId, seller.id), isNotNull(orders.problem), isNull(orders.problemClosedAt)))
        .returning({ id: orders.id })
    : []
  return done.length > 0 ? { ok: true } : { ok: false, error: "That report is not waiting for an answer any more." }
}

// ---------------------------------------------------------------- stopping

// The seller stops selling here, for good. At once: every item of theirs is off the shelf, every
// code that is not sold and not set aside for an order is deleted, the address they are told at
// is forgotten, and their page is not found. An order that is already placed still runs to its
// end with the code that was set aside for it, and what they owe buyers and what buyers reported
// stays on their desk to deal with. The rest goes later, by itself (forgetLeft).
export async function leave(seller: Seller, now = Date.now()): Promise<Result & { removed?: number }> {
  if (seller.leftAt !== null) return { ok: false, error: "You have stopped selling here already." }
  const db = await getDb()
  const theirs = (await db.select({ id: products.id }).from(products).where(eq(products.sellerId, seller.id))).map((row) => row.id)
  let removed = 0
  if (theirs.length > 0) {
    await db.update(products).set({ active: false }).where(eq(products.sellerId, seller.id))
    removed = (await db.delete(stock).where(and(inArray(stock.productId, theirs), eq(stock.state, "free"))).returning({ id: stock.id })).length
  }
  await db.update(sellers).set({ leftAt: now, notifyUrl: null }).where(eq(sellers.id, seller.id))
  return { ok: true, removed }
}

// What is left of sellers who stopped, once none of their orders is kept any more (an order is
// deleted days after it is done, and never while a refund is owed or a report unanswered): the
// payment engine deletes the viewing key it kept for them, and then their items, the rows of the
// codes that were handed over and their own row are deleted here. Nothing of them remains. Run
// every minute by the server itself. A seller the engine would not or could not forget is kept
// and tried again: their row is what still holds the key to do it with.
export async function forgetLeft(): Promise<number> {
  const db = await getDb()
  const gone = await db.select().from(sellers).where(isNotNull(sellers.leftAt))
  let forgotten = 0
  for (const seller of gone) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(eq(orders.sellerId, seller.id))
    if (count > 0) continue
    if ((await forgetViewingKey(seller.engineKey)) !== "gone") continue
    const theirs = (await db.select({ id: products.id }).from(products).where(eq(products.sellerId, seller.id))).map((row) => row.id)
    if (theirs.length > 0) {
      await db.delete(stock).where(inArray(stock.productId, theirs))
      await db.delete(products).where(eq(products.sellerId, seller.id))
    }
    await db.delete(sellers).where(eq(sellers.id, seller.id))
    forgotten += 1
  }
  return forgotten
}

// ---------------------------------------------------------------- the seller's own page

export type Storefront = { name: string; slug: string; items: ShelfItem[] }

// A seller's page (/s/<slug>): their name and what of theirs is on the shelf right now. Null when
// there is no such seller, or none whose items can be ordered: selling is off, the seller was
// closed, or their key is of another network than payments run on. Then the page is not found,
// and it does not say which of those it was. Nothing about a seller is on it but the name they
// chose and their items.
export async function storefront(slug: string, now = Date.now()): Promise<Storefront | null> {
  if (!sellingOn() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null
  const db = await getDb()
  const [seller] = await db.select().from(sellers).where(eq(sellers.slug, slug))
  if (!seller || seller.closedAt !== null || seller.leftAt !== null || seller.network !== engine().network) return null
  const items = (await listItems(now)).filter((item) => item.sellerSlug === slug)
  return { name: seller.name, slug, items }
}

// ---------------------------------------------------------------- the shop's owner

export type OwnerSeller = {
  id: string
  name: string
  slug: string | null
  network: "testnet" | "mainnet"
  createdAt: number
  closedAt: number | null
  leftAt: number | null
  items: { id: number; slug: string; name: string; priceCents: number; active: boolean; takenDown: boolean; free: number }[]
  delivered: number
  // What this seller owes buyers and has not said was sent, as the payment engine saw it.
  owedOrders: number
  // Reports from buyers about this seller's items that the seller has not answered.
  reports: { product: string; note: string; at: number }[]
}

// Every seller, with what the owner needs to decide whether an item or a seller stays: the items,
// the reports nobody answered and the refunds not sent. Newest seller first. Nothing here checks
// who is asking: the screen does (lib/owner-session.ts).
export async function listSellers(): Promise<OwnerSeller[]> {
  const db = await getDb()
  const all = await db.select().from(sellers).orderBy(desc(sellers.createdAt))
  const items = await db.select().from(products).where(isNotNull(products.sellerId)).orderBy(asc(products.id))
  const free = await db
    .select({ productId: stock.productId, count: sql<number>`count(*)` })
    .from(stock)
    .where(eq(stock.state, "free"))
    .groupBy(stock.productId)
  const placed = await db
    .select({ order: orders, product: sql<string>`coalesce(${products.name}, 'Item')` })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(isNotNull(orders.sellerId))

  return all.map((seller) => {
    const theirs = placed.filter(({ order }) => order.sellerId === seller.id)
    return {
      id: seller.id,
      name: seller.name,
      slug: seller.slug,
      network: seller.network,
      createdAt: seller.createdAt,
      closedAt: seller.closedAt,
      leftAt: seller.leftAt,
      items: items
        .filter((item) => item.sellerId === seller.id)
        .map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          priceCents: item.priceCents,
          active: item.active,
          takenDown: item.takenDownAt !== null,
          free: free.find((row) => row.productId === item.id)?.count ?? 0,
        })),
      delivered: theirs.filter(({ order }) => order.state === "delivered").length,
      owedOrders: theirs.filter(({ order }) => order.owedZat > 0 && order.refundedAt === null).length,
      reports: theirs
        .filter(({ order }) => order.problem !== null && order.problemClosedAt === null)
        .map(({ order, product }) => ({ product, note: order.problem ?? "", at: order.problemAt ?? 0 })),
    }
  })
}

// How many reports about sellers' items nobody has answered: the number on the owner's tab.
export async function countSellerReports() {
  const db = await getDb()
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(and(isNotNull(orders.sellerId), isNotNull(orders.problem), isNull(orders.problemClosedAt)))
  return row?.count ?? 0
}

// The owner takes a seller's item down, or puts it back. Down: it is off the shelf at once and
// the seller cannot put it back. An order of it that is already paid still runs to its end.
export async function takeDown(productId: number, down: boolean, now = Date.now()): Promise<Result> {
  const db = await getDb()
  const done = await db
    .update(products)
    .set(down ? { takenDownAt: now, active: false } : { takenDownAt: null })
    .where(and(eq(products.id, productId), isNotNull(products.sellerId)))
    .returning({ id: products.id })
  return done.length > 0 ? { ok: true } : { ok: false, error: "There is no such item of a seller's." }
}

// The owner closes a seller, or opens them again. Closed: none of their items can be ordered and
// they can list nothing. Their desk still opens, so that what they owe buyers can be dealt with.
export async function closeSeller(sellerId: string, closed: boolean, now = Date.now()): Promise<Result> {
  const db = await getDb()
  const done = await db
    .update(sellers)
    .set({ closedAt: closed ? now : null })
    .where(eq(sellers.id, sellerId))
    .returning({ id: sellers.id })
  return done.length > 0 ? { ok: true } : { ok: false, error: "There is no such seller." }
}
