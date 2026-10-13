import { and, gt, isNull } from "drizzle-orm"

import { listProblems } from "@/lib/admin"
import { getDb, schema } from "@/lib/db"
import { handHours, listToBuy } from "@/lib/orders"
import { engineFitNow } from "@/lib/payment"
import { sendLine } from "@/lib/notify-send"
import { listSellers } from "@/lib/sellers"

// Telling the owner that something waits for them: a paid order whose item has to be bought, a
// report from a buyer, a refund that is due. One line is sent to an address the owner sets in
// OWNER_NOTIFY_URL (a notification service that hands it to the owner's phone). The line says
// that something waits and what kind of thing. It names no order, no item and no amount: whoever
// runs that service learns that the shop had something to do and when, and nothing else.
//
// Nothing is kept in the database about a notice. What was already said is remembered while the
// server runs; after a restart, whatever still waits is said once more.

type Said = { toBuy: Set<string>; reminded: Set<string>; problems: Set<string>; refunds: Set<string>; sellers: Set<string>; engine: Set<string> }
const store = globalThis as unknown as { zolaceSaid?: Said }
const said = (): Said =>
  (store.zolaceSaid ??= { toBuy: new Set(), reminded: new Set(), problems: new Set(), refunds: new Set(), sellers: new Set(), engine: new Set() })

// For the tests: forget what was said.
export function forgetNotices() {
  store.zolaceSaid = undefined
}

function noticeUrl(): URL | null {
  const text = (process.env.OWNER_NOTIFY_URL ?? "").trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export const noticesOn = () => noticeUrl() !== null

// Sends one line to the owner's address (lib/notify-send.ts). False when it did not go out.
export async function sendNotice(text: string): Promise<boolean> {
  const url = noticeUrl()
  return url ? sendLine(url, text) : false
}

// How long before an order's time runs out the owner is told a second time.
const remindMs = () => Math.min(2, handHours() / 2) * 60 * 60 * 1000

// One round, run every minute by the server itself (instrumentation-owner.ts). It moves paid
// orders along, so an order is on the owner's list, or owed back when its time is up, even if
// nobody has its page open. Then it says what is new. Returns how many lines went out.
export async function ownerTick(now = Date.now()): Promise<number> {
  const waiting = await listToBuy(now)
  if (!noticesOn()) return 0

  const memory = said()
  let sent = 0
  const say = async (set: Set<string>, id: string, text: string) => {
    if (set.has(id)) return
    // Only what went out counts as said: a line that failed is tried again on the next round.
    if (await sendNotice(text)) {
      set.add(id)
      sent += 1
    }
  }

  // The engine and the chain: said once per upgrade, when it is scheduled and again when it is there.
  const fit = await engineFitNow(now)
  if (fit?.state === "unread") {
    await say(memory.engine, `unread:${fit.upgrade}`, "Zolace: the Zcash network is on an upgrade the payment engine cannot read. No order is started until the engine is updated.")
  } else if (fit?.state === "ahead") {
    await say(memory.engine, `ahead:${fit.next}`, "Zolace: a Zcash network upgrade is scheduled that the payment engine cannot read. Update the engine before it takes effect.")
  }

  for (const order of waiting) {
    if (order.test) continue
    await say(memory.toBuy, order.id, `Zolace: an order is paid and waits for its item. Buy it and hand it over on the owner's screen within ${handHours()} hours.`)
    if (now > order.handBy - remindMs()) {
      await say(memory.reminded, order.id, "Zolace: an order still waits for its item. Its time is nearly up: after that the payment is owed back.")
    }
  }

  for (const problem of await listProblems()) {
    await say(memory.problems, problem.id, "Zolace: a buyer reported a problem with an item. It waits on the refunds screen.")
  }

  // A report about another seller's item is the seller's to answer, but the owner decides whether
  // the item stays: one line per report, by when it was made.
  for (const seller of await listSellers()) {
    for (const report of seller.reports) {
      await say(memory.sellers, `${seller.id}:${report.at}`, "Zolace: a buyer reported another seller's item. It is on the sellers screen.")
    }
  }

  const db = await getDb()
  const due = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    // Only what the shop itself owes: an order of another seller's item is that seller's to refund.
    .where(and(gt(schema.orders.owedZat, 0), isNull(schema.orders.refundedAt), isNull(schema.orders.sellerId)))
  for (const order of due) {
    await say(memory.refunds, order.id, "Zolace: a refund is due. It waits on the refunds screen.")
  }
  return sent
}
