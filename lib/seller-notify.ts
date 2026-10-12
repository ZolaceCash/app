import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import type { Seller } from "@/lib/db/schema"
import { sendLine } from "@/lib/notify-send"
import { sweepSellers } from "@/lib/orders"

const { orders, products, sellers, stock } = schema

// Telling a seller that something waits for them: an order of theirs was paid and handed over, an
// item ran out of codes, a buyer reported an item, a refund is theirs to send. A seller has no
// account and gave no email, so without this they only learn of it by opening their desk.
//
// The seller sets the address of a notification service at their desk. One line goes there. It
// says that something happened and what kind of thing. It names no order, no item, no amount and
// no buyer: whoever runs that service learns that this seller had something to do and when, and
// nothing else.
//
// Nothing is kept in the database about a notice but the address. What was already said is
// remembered while the server runs; after a restart, whatever still waits is said once more, and
// a sale from the minute of the restart may go unsaid.

// Only three services are taken, each by its own shape of address. The server sends where the
// seller says, so it must not be made to call anything else: not the server's own network, not
// another site's forms.
const SHAPES: { where: string; host: RegExp; path: RegExp; query: RegExp }[] = [
  // A topic with a long name: whoever guesses a short one could read the lines.
  { where: "ntfy", host: /^ntfy\.sh$/, path: /^\/[A-Za-z0-9_-]{16,64}$/, query: /^$/ },
  { where: "Telegram", host: /^api\.telegram\.org$/, path: /^\/bot\d{5,}:[A-Za-z0-9_-]{30,}\/sendMessage$/, query: /^\?chat_id=(-?\d{3,}|@[A-Za-z0-9_]{4,})$/ },
  { where: "Discord", host: /^(discord|discordapp)\.com$/, path: /^\/api\/webhooks\/\d{6,}\/[A-Za-z0-9_.-]{20,}$/, query: /^$/ },
]

// The address a seller typed, when it is one of those. Null otherwise.
export function noticeAddress(text: string): URL | null {
  const typed = text.trim()
  if (typed.length < 20 || typed.length > 300) return null
  let url: URL
  try {
    url = new URL(typed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null
  return SHAPES.some((shape) => shape.host.test(url.hostname) && shape.path.test(url.pathname) && shape.query.test(url.search)) ? url : null
}

// Which service an address is, for the desk to say without showing the address again.
export function noticeWhere(address: string | null): string | null {
  const url = address ? noticeAddress(address) : null
  return url ? (SHAPES.find((shape) => shape.host.test(url.hostname))?.where ?? null) : null
}

export const LINES = {
  test: "Zolace: this is a test line from your seller's desk.",
  sold: "Zolace: an order of one of your items was paid and handed over.",
  empty: "Zolace: one of your items has no codes left. It reads as sold out until you add more.",
  report: "Zolace: a buyer reported one of your items. It waits on your desk.",
  refund: "Zolace: you owe a buyer a refund. It waits on your desk.",
} as const

export type Result = { ok: true } | { ok: false; error: string }

// The seller sets where they are told, or takes it away with nothing typed.
export async function setNotice(seller: Seller, text: string): Promise<Result> {
  const typed = text.trim()
  const url = typed ? noticeAddress(typed) : null
  if (typed && !url) {
    return {
      ok: false,
      error:
        "That is not an address this takes. Give an ntfy topic (https://ntfy.sh/ and a name of 16 characters or more), a Telegram bot's sendMessage address with its chat_id, or a Discord webhook.",
    }
  }
  const db = await getDb()
  await db
    .update(sellers)
    .set({ notifyUrl: url ? url.href : null })
    .where(eq(sellers.id, seller.id))
  return { ok: true }
}

type Said = { sold: Set<string>; empty: Set<string>; reports: Set<string>; refunds: Set<string>; tested: Map<string, number>; since: number }
const store = globalThis as unknown as { zolaceSellerSaid?: Said }
const said = (now: number): Said =>
  (store.zolaceSellerSaid ??= { sold: new Set(), empty: new Set(), reports: new Set(), refunds: new Set(), tested: new Map(), since: now })

// For the tests: forget what was said.
export function forgetSellerNotices() {
  store.zolaceSellerSaid = undefined
}

const TEST_EVERY_MS = 30_000

// A test line, so the seller sees that the address works. One every half minute: the button is
// not a way to fill somebody's channel.
export async function testNotice(seller: Seller, now = Date.now()): Promise<Result> {
  const url = seller.notifyUrl ? noticeAddress(seller.notifyUrl) : null
  if (!url) return { ok: false, error: "Save an address first." }
  const memory = said(now)
  const last = memory.tested.get(seller.id) ?? 0
  if (now - last < TEST_EVERY_MS) return { ok: false, error: "A test line was just sent. Wait half a minute." }
  memory.tested.set(seller.id, now)
  return (await sendLine(url, LINES.test, "seller notice")) ? { ok: true } : { ok: false, error: "The service did not take the line. Check the address." }
}

// How far back a sale is still told: the round runs every minute, so this only matters when a
// round was missed.
const SOLD_WITHIN_MS = 10 * 60 * 1000

// One round, run every minute by the server itself (instrumentation-owner.ts). It moves along the
// sellers' orders that only time or a confirmation can move, so an order is handed over or owed
// back even if nobody has its page open, and then tells each seller who gave an address what is
// new for them. Returns how many lines went out.
export async function sellerTick(now = Date.now()): Promise<number> {
  await sweepSellers(now)
  const db = await getDb()
  const told = await db.select().from(sellers).where(isNotNull(sellers.notifyUrl))
  if (told.length === 0) return 0

  const memory = said(now)
  let sent = 0
  const say = async (set: Set<string>, id: string, url: URL, text: string) => {
    if (set.has(id)) return
    // Only what went out counts as said: a line that failed is tried again on the next round.
    if (await sendLine(url, text, "seller notice")) {
      set.add(id)
      sent += 1
    }
  }

  for (const seller of told) {
    const url = noticeAddress(seller.notifyUrl ?? "")
    if (!url) continue
    const theirs = await db.select().from(orders).where(and(eq(orders.sellerId, seller.id), eq(orders.test, false)))

    // Sold: handed over since the server started, and not long ago.
    for (const order of theirs) {
      if (order.state === "delivered" && order.deliveredAt !== null && order.deliveredAt >= Math.max(memory.since, now - SOLD_WITHIN_MS)) {
        await say(memory.sold, order.id, url, LINES.sold)
      }
      if (order.problem !== null && order.problemClosedAt === null) await say(memory.reports, order.id, url, LINES.report)
      if (order.owedZat > 0 && order.refundedAt === null) await say(memory.refunds, order.id, url, LINES.refund)
    }

    // Out of codes: an item on the shelf that has sold at least one and has none left. Said once
    // while it stays empty, and again the next time it runs out.
    const counts = await db
      .select({ id: products.id, free: sql<number>`sum(case when ${stock.state} = 'free' then 1 else 0 end)`, given: sql<number>`sum(case when ${stock.state} = 'given' then 1 else 0 end)` })
      .from(products)
      .innerJoin(stock, eq(stock.productId, products.id))
      .where(and(eq(products.sellerId, seller.id), eq(products.active, true), isNull(products.takenDownAt)))
      .groupBy(products.id)
    for (const item of counts) {
      const key = `${item.id}`
      if (item.free > 0) memory.empty.delete(key)
      else if (item.given > 0) await say(memory.empty, key, url, LINES.empty)
    }
  }
  return sent
}
