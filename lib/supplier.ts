// An item that is made when it is paid for: an eSIM, bought from eSIM Access the moment an order's
// payment is three blocks deep, and never held in stock (PLAN.md, "How an item is handed over").
//
// The owner keeps a prepaid balance with the supplier; each order is bought out of it. So this
// file holds a key that can spend that balance, and nothing else: it cannot move ZEC, and the most
// it can lose is what the owner chose to deposit.
//
// Written from the supplier's published interface (docs.esimaccess.com). Amounts there are in
// ten-thousandths of a dollar: 10000 is $1.00.

const BASE = "https://api.esimaccess.com/api/v1/open"
const TIMEOUT_MS = 15_000
// The supplier's price list and the owner's balance are reused for this long: a burst of
// checkouts is not a burst of questions.
const FRESH_MS = 60_000

type Answer = { success?: boolean; errorCode?: string | null; errorMsg?: string | null; obj?: Record<string, unknown> | null }

const accessCode = () => (process.env.ESIMACCESS_CODE ?? "").trim()

// True when the server was given the key to the supplier. Without it no such item is sold.
export const supplierOn = () => accessCode().length > 0

async function ask(path: string, body: unknown): Promise<Answer | null> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "RT-AccessCode": accessCode(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    return (await response.json().catch(() => null)) as Answer | null
  } catch {
    return null
  }
}

let prices: { at: number; byCode: Map<string, number> } | null = null
let funds: { at: number; cents: number } | null = null

// For the tests: the next question to the supplier is really asked.
export const forgetSupplier = () => {
  prices = null
  funds = null
}

// What a package costs the owner right now, in cents, by its code or its slug. Null when the
// supplier does not answer or does not list it.
export async function wholesaleCents(packageCode: string, now = Date.now()): Promise<number | null> {
  if (!prices || now < prices.at || now - prices.at > FRESH_MS) {
    const answer = await ask("/package/list", { locationCode: "", type: "BASE", packageCode: "", slug: "", iccid: "" })
    const list = answer?.success ? (answer.obj?.packageList as { packageCode?: string; slug?: string; price?: number }[] | undefined) : undefined
    if (!list) return null
    const byCode = new Map<string, number>()
    for (const item of list) {
      // Rounded up to a whole cent: the shop must never count a cost as smaller than it is.
      const cents = Math.ceil(Number(item.price) / 100)
      if (!Number.isFinite(cents) || cents <= 0) continue
      if (item.packageCode) byCode.set(item.packageCode, cents)
      if (item.slug) byCode.set(item.slug, cents)
    }
    prices = { at: now, byCode }
  }
  return prices.byCode.get(packageCode) ?? null
}

// What is left of the owner's deposit, in cents. Null when the supplier does not answer.
export async function balanceCents(now = Date.now()): Promise<number | null> {
  if (!funds || now < funds.at || now - funds.at > FRESH_MS) {
    const answer = await ask("/balance/query", "")
    const balance = Number(answer?.success ? answer.obj?.balance : NaN)
    if (!Number.isFinite(balance)) return null
    funds = { at: now, cents: Math.floor(balance / 100) }
  }
  return funds.cents
}

// Whether the item can be sold right now, asked before an order is started: the supplier lists
// it, it costs the owner no more than the shop asks for it, and the deposit covers it. An order
// that could not be filled would only become a refund.
export async function canSupply(packageCode: string, priceCents: number, now = Date.now()): Promise<boolean> {
  if (!supplierOn()) return false
  const cost = await wholesaleCents(packageCode, now)
  if (cost === null || cost > priceCents) return false
  const left = await balanceCents(now)
  return left !== null && left >= cost
}

export type Supplied =
  // The item, as the text the buyer is handed: the eSIM's activation code.
  | { state: "ready"; ref: string; payload: string }
  // Bought, and still being made by the supplier. Look again shortly.
  | { state: "making"; ref: string }
  // The supplier did not answer. Nothing is known: look again, and do not give up on the order.
  | { state: "unknown" }
  // The supplier refused the order (no balance, no such package, none left). Nothing was bought.
  | { state: "refused"; why: string }

// The name an order goes by at the supplier: a hash of its id. The id itself is the first half of
// the buyer's link and opens the order's status page, so it is not handed to anyone. The hash is
// the same every time, which is what makes a repeated purchase the same purchase.
export async function transactionId(orderId: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`zolace-supply:${orderId}`))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40)
}

// Buys the item for one order, or picks up an order that was already bought. The supplier takes
// a repeated transaction id as the same request: an order is bought once however often this is
// called, also after a crash between buying and writing it down.
export async function supply(input: { orderId: string; packageCode: string; ref: string | null }): Promise<Supplied> {
  let ref = input.ref
  if (!ref) {
    const bought = await ask("/esim/order", {
      transactionId: await transactionId(input.orderId),
      packageInfoList: [{ packageCode: input.packageCode, count: 1 }],
    })
    if (!bought) return { state: "unknown" }
    const orderNo = bought.obj?.orderNo
    if (!bought.success || typeof orderNo !== "string") {
      return { state: "refused", why: `${bought.errorCode ?? "?"} ${bought.errorMsg ?? ""}`.trim() }
    }
    ref = orderNo
    // The deposit just shrank: the next checkout asks for it afresh.
    funds = null
  }

  const made = await ask("/esim/query", { orderNo: ref, iccid: "", pager: { pageNum: 1, pageSize: 5 } })
  if (!made) return { state: "making", ref }
  // Not there yet (the supplier says so with code 200010), or not answered properly: either way
  // the order is bought and the thing to do is to look again. lib/orders.ts stops waiting in time.
  if (!made.success) return { state: "making", ref }
  const profile = (made.obj?.esimList as { ac?: string }[] | undefined)?.[0]
  const code = profile?.ac
  return typeof code === "string" && code.startsWith("LPA:") ? { state: "ready", ref, payload: code } : { state: "making", ref }
}
