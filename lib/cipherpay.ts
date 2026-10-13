import { engineFit, forgetFit } from "@/lib/engine-fit"
import type { Invoice, Opened, PaymentEngine, Registered, Seen } from "@/lib/payment"
import { MAX_GAP } from "@/lib/price"

// CipherPay as the payment engine (engine/cipherpay/, and PLAN.md "Stage 0"). It runs beside the
// site, on the same server and reachable from nowhere else. It is given a viewing key, makes one
// address per invoice from it, and reports what arrives there. It cannot spend, and neither can
// anything here: this file only asks it for an address and reads what it saw.
//
// Three things about it that this file works around or passes on:
// - It prices an invoice itself, from one source. The site's rule is two sources within 2% of each
//   other, so the engine's rate is held against the site's own, and an order is refused when the
//   two are further apart than that.
// - It calls a payment confirmed after one block and reports no depth. The site waits for three,
//   so the depth is asked of the chain explorer the engine itself reads from.
// - It stops watching an invoice when the invoice expires, and it never looks at one again once it
//   is confirmed. A payment after that, or a second one, is not seen by anything here: only the
//   owner's wallet shows it. (engine/cipherpay/watch.patch changes both for the engine this shop runs.)
// - It drops a transaction of a network upgrade its build does not know, without an error, and
//   still calls itself healthy. So its health is not enough: the chain's own upgrade is held
//   against what the engine can read (lib/engine-fit.ts), and no order is started when they differ.

type Config = { url: string; key: string; network: "testnet" | "mainnet"; scanUrl: string }

// A unified address starts with this on each network. An engine set up for the other network
// would hand out addresses the site then describes wrongly: refused before any order is made.
const PREFIX = { mainnet: "u1", testnet: "utest1" } as const

const TIMEOUT_MS = 8000
// The engine's health is asked at most this often: a burst of checkouts is not a burst of calls.
const HEALTH_FRESH_MS = 10_000
let health: { at: number; url: string; ok: boolean } | null = null

// What the engine said about an invoice is reused for this long. An open order page asks every
// two seconds, and several people may watch the same order: the engine is asked once for all.
const LOOK_FRESH_MS = 3000
const looked = new Map<string, { at: number; seen: Seen }>()

// For the tests: the next question to the engine is really asked.
export const forgetHealth = () => {
  health = null
  looked.clear()
  forgetFit()
}

async function ask(url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    return { status: response.status, body }
  } catch {
    return null
  }
}

const STATE: Record<string, Seen["state"]> = {
  pending: "waiting",
  underpaid: "underpaid",
  detected: "seen",
  confirmed: "confirmed",
  expired: "expired",
}

// Another seller's viewing key, given to the engine (lib/sellers.ts). The engine keeps the half
// that sees incoming payments, encrypted, and answers with a key of its own for that seller; an
// invoice opened with that key gets an address from the seller's viewing key. Only the viewing
// key is sent: no name and nothing else about the seller.
export async function register(config: Pick<Config, "url">, viewingKey: string): Promise<Registered> {
  const made = await ask(`${config.url}/api/merchants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ufvk: viewingKey }),
  })
  if (!made) return { ok: false, reason: "unavailable" }
  if (made.status === 409) return { ok: false, reason: "taken" }
  if (made.status === 429) return { ok: false, reason: "busy" }
  if (made.status === 400) return { ok: false, reason: "refused" }
  const key = made.body?.api_key
  if (made.status >= 300 || typeof key !== "string" || !key) return { ok: false, reason: "unavailable" }
  return { ok: true, key }
}

// A seller who stopped selling is taken out of the engine: the viewing key it kept for them is
// deleted, with every invoice of theirs. "gone": the engine no longer knows the key to it, now or
// already. "kept": the engine knows it and would not delete it (a build without
// engine/cipherpay/leave.patch answers so). "unavailable": no answer.
export async function forget(config: Pick<Config, "url">, key: string): Promise<"gone" | "kept" | "unavailable"> {
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
  // Whether the engine still knows the key at all: its list of invoices answers to it.
  const known = await ask(`${config.url}/api/invoices`, { headers })
  if (!known) return "unavailable"
  if (known.status === 401) return "gone"
  if (known.status !== 200) return "unavailable"
  const deleted = await ask(`${config.url}/api/merchants/me/delete`, { method: "POST", headers })
  if (!deleted) return "unavailable"
  return deleted.status === 200 ? "gone" : "kept"
}

export function cipherpay(config: Config): PaymentEngine {
  const authorised = { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" }

  return {
    network: config.network,

    async open({ priceCents, usdPerZec }): Promise<Opened> {
      // Only the amount goes to the engine: not the item, not the order's own name.
      const made = await ask(`${config.url}/api/invoices`, {
        method: "POST",
        headers: authorised,
        body: JSON.stringify({ amount: priceCents / 100, currency: "USD" }),
      })
      const body = made?.body
      if (!made || made.status >= 300 || !body) return { ok: false, reason: "unavailable" }

      const ref = body.invoice_id
      const address = body.payment_address
      const priceZec = Number(body.price_zec)
      const rate = Number(body.zec_rate)
      if (typeof ref !== "string" || typeof address !== "string" || !(priceZec > 0) || !(rate > 0)) {
        return { ok: false, reason: "unavailable" }
      }

      const cancel = () => ask(`${config.url}/api/invoices/${ref}/cancel`, { method: "POST", headers: authorised })
      if (!address.startsWith(PREFIX[config.network])) {
        await cancel()
        return { ok: false, reason: "unavailable" }
      }
      if (Math.abs(rate - usdPerZec) / Math.min(rate, usdPerZec) > MAX_GAP) {
        await cancel()
        return { ok: false, reason: "price-disagree" }
      }
      // The engine keeps the same number: the amount in ZEC, to the nearest zatoshi.
      return { ok: true, ref, address, zat: Math.round(priceZec * 100_000_000) }
    },

    async look(invoice: Invoice, now: number): Promise<Seen | null> {
      if (!invoice.ref) return null
      const recent = looked.get(invoice.ref)
      if (recent && now >= recent.at && now - recent.at < LOOK_FRESH_MS) return recent.seen
      if (looked.size > 5000) looked.clear()
      const answer = await ask(`${config.url}/api/invoices/${invoice.ref}/status`)
      const body = answer?.body
      if (!answer || answer.status !== 200 || !body) return null

      const state = STATE[String(body.status)]
      if (!state) return null
      const txid = typeof body.detected_txid === "string" ? body.detected_txid : null
      const receivedZat = Number(body.received_zatoshis)

      let confirmations = 0
      if (state === "confirmed") {
        // In a block, by the engine's word. How deep is asked of the explorer; without an answer
        // it counts as one, and the order waits rather than being handed over early.
        confirmations = 1
        if (txid && config.scanUrl) {
          const depth = Number((await ask(`${config.scanUrl}/api/tx/${txid}`))?.body?.confirmations)
          if (Number.isSafeInteger(depth) && depth > 1) confirmations = depth
        }
      }
      const seen: Seen = { state, receivedZat: Number.isSafeInteger(receivedZat) && receivedZat > 0 ? receivedZat : 0, txid, confirmations }
      looked.set(invoice.ref, { at: now, seen })
      return seen
    },

    async healthy() {
      const now = Date.now()
      if (health && health.url === config.url && now - health.at < HEALTH_FRESH_MS) return health.ok
      const answer = await ask(`${config.url}/api/health`)
      // "degraded" is the engine catching up by a few blocks: it still sees payments. "unhealthy"
      // is a scanner that fell behind or a database it cannot read, answered with an error.
      let ok = answer?.status === 200 && answer.body?.status !== "unhealthy"
      // Healthy by its own word, and the chain is on an upgrade it cannot read: a payment would
      // not be seen. An explorer that does not answer decides nothing here.
      if (ok && config.scanUrl && (await engineFit(config.scanUrl, now)).state === "unread") ok = false
      health = { at: now, url: config.url, ok }
      return ok
    },
  }
}
