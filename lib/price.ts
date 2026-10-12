// The ZEC price. PLAN.md: two sources, no price when they differ by more than 2%.

export const MAX_GAP = 0.02
// Amounts are kept in zatoshi, the smallest unit of ZEC: whole numbers, so nothing is rounded twice.
export const ZAT_PER_ZEC = 100_000_000

export type Quote =
  | { ok: true; usdPerZec: number; sources: [number, number] }
  // unavailable: a source did not answer. disagree: both answered, too far apart.
  | { ok: false; reason: "unavailable" | "disagree" }

// The rule on its own, so it can be tested without a network.
export function settle(a: number | null, b: number | null): Quote {
  if (!a || !b || a <= 0 || b <= 0) return { ok: false, reason: "unavailable" }
  if (Math.abs(a - b) / Math.min(a, b) > MAX_GAP) return { ok: false, reason: "disagree" }
  return { ok: true, usdPerZec: (a + b) / 2, sources: [a, b] }
}

// What a price in cents costs in zatoshi at a rate, rounded up so the shop is never short.
export function toZat(priceCents: number, usdPerZec: number) {
  return Math.ceil((priceCents / 100 / usdPerZec) * ZAT_PER_ZEC)
}

export function formatZec(zat: number) {
  return (zat / ZAT_PER_ZEC).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
}

async function ask(url: string, pick: (body: unknown) => unknown) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" })
    if (!response.ok) return null
    const value = Number(pick(await response.json()))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

type Json = Record<string, never>

const kraken = () =>
  ask("https://api.kraken.com/0/public/Ticker?pair=ZECUSD", (body) => {
    const pairs = (body as Json).result as Record<string, { c: string[] }>
    return Object.values(pairs ?? {})[0]?.c[0]
  })

const coinbase = () =>
  ask("https://api.coinbase.com/v2/prices/ZEC-USD/spot", (body) => ((body as Json).data as Json)?.amount)

// A quote is reused for this long, so a burst of checkouts does not become a burst of requests.
const FRESH_MS = 30_000
let last: { at: number; quote: Quote } | null = null

export async function quoteZec(now = Date.now()): Promise<Quote> {
  if (last && last.quote.ok && now - last.at < FRESH_MS) return last.quote
  const [a, b] = await Promise.all([kraken(), coinbase()])
  const quote = settle(a, b)
  last = { at: now, quote }
  return quote
}

// The rate for anyone who only wants to know it: an item's page shows about what its price is in
// ZEC before an order is placed (app/api/price). `at` is when the sources were asked.
export type Rate = { ok: true; usdPerZec: number; at: number } | { ok: false; reason: "unavailable" | "disagree" }

// An answer is reused for this long whatever it was, so that pages being read never become a
// stream of requests to the sources, also while a source is down. A checkout does not come
// through here: it asks quoteZec for itself.
export const RATE_MS = 20_000
let told: { at: number; rate: Rate } | null = null

export async function rateNow(now = Date.now()): Promise<Rate> {
  if (told && now >= told.at && now - told.at < RATE_MS) return told.rate
  const quote = await quoteZec(now)
  const rate: Rate = quote.ok ? { ok: true, usdPerZec: quote.usdPerZec, at: now } : { ok: false, reason: quote.reason }
  told = { at: now, rate }
  return rate
}

// About what a price is in ZEC at a rate, for reading before an order: four places, rounded up,
// so that the amount an order then asks for is not more than a page led anyone to expect by
// rounding alone. The exact amount is the order's, to eight places.
export function aboutZec(priceCents: number, usdPerZec: number) {
  const zat = toZat(priceCents, usdPerZec)
  return (Math.ceil(zat / 10_000) / 10_000).toFixed(4)
}
