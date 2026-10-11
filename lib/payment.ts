import { cipherpay } from "@/lib/cipherpay"
import { toZat } from "@/lib/price"

// The payment engine sits behind this interface so it can be replaced (PLAN.md, "Architecture").
// There are two: the stand-in below, which moves no money and is what runs unless the server is
// told otherwise, and CipherPay (lib/cipherpay.ts), which watches the Zcash chain with a viewing
// key. Neither can spend: nothing in this site holds a key that could.

export const CONFIRMATIONS_NEEDED = 3

// The smallest amount worth sending back. A refund is a transaction and pays the network's fee,
// which is 10,000 zatoshi for the simplest one (ZIP-317); less than that cannot be returned.
export const FEE_ZAT = 10_000

// stand-in: pretend payments. testnet: the real engine on Zcash's test network, whose coins are
// worth nothing. mainnet: real ZEC.
export type Network = "stand-in" | "testnet" | "mainnet"

export type Invoice = {
  orderId: string
  // The engine's own name for this order's invoice. Null with the stand-in, which keeps none.
  ref: string | null
  address: string
  zat: number
  seenAt: number | null
  txid: string | null
}

// What the engine sees for one invoice.
// waiting: nothing has arrived. underpaid: part of the amount has. seen: all of it, not yet in a
// block. confirmed: in a block. expired: the engine stopped watching, and nothing counted arrived.
export type Seen = {
  state: "waiting" | "underpaid" | "seen" | "confirmed" | "expired"
  receivedZat: number
  txid: string | null
  // How many blocks deep the payment is. 0 until it is in one.
  confirmations: number
}

export type Opened =
  | { ok: true; ref: string | null; address: string; zat: number }
  // unavailable: the engine did not answer, or answered with something this site cannot use.
  // price-disagree: the engine's own ZEC price is too far from the site's two sources.
  | { ok: false; reason: "unavailable" | "price-disagree" }

export interface PaymentEngine {
  readonly network: Network
  // An address made for this order and no other, and the amount to send to it.
  open(input: { orderId: string; priceCents: number; usdPerZec: number }): Promise<Opened>
  // Null when the engine did not answer: the order then stays where it is.
  look(invoice: Invoice, now: number): Promise<Seen | null>
  // False when the engine cannot be trusted to see a payment right now. No order is started then.
  healthy(): Promise<boolean>
}

// A stand-in block: far shorter than a real one (about 75 seconds), so a test order finishes
// while someone is watching.
const TEST_BLOCK_MS = 4000

// Pretends a payment arrives when the buyer presses "Simulate the payment" (which sets seenAt)
// and that a block follows every few seconds after that.
export const standIn: PaymentEngine = {
  network: "stand-in",
  async open({ orderId, priceCents, usdPerZec }) {
    // Deliberately not shaped like a Zcash address, so it cannot be mistaken for one.
    return { ok: true, ref: null, address: `test-address-${orderId.slice(0, 12)}`, zat: toZat(priceCents, usdPerZec) }
  },
  async look(invoice, now) {
    if (invoice.seenAt === null) return { state: "waiting", receivedZat: 0, txid: null, confirmations: 0 }
    const confirmations = Math.min(CONFIRMATIONS_NEEDED, Math.floor((now - invoice.seenAt) / TEST_BLOCK_MS))
    return { state: confirmations > 0 ? "confirmed" : "seen", receivedZat: invoice.zat, txid: null, confirmations }
  },
  async healthy() {
    return true
  },
}

// The engine the server is told to use, read when it is needed and not when the site is built.
// It takes all three settings to leave the stand-in: where the engine is, the key to it, and
// which network it is on. With one missing or mistyped the site keeps taking test orders, which
// say on their face that no money moves.
export function engine(): PaymentEngine {
  const url = (process.env.CIPHERPAY_URL ?? "").trim().replace(/\/+$/, "")
  const key = (process.env.CIPHERPAY_API_KEY ?? "").trim()
  const network = (process.env.PAYMENT_NETWORK ?? "").trim()
  if (!url || !key || (network !== "testnet" && network !== "mainnet")) return standIn
  return cipherpay({ url, key, network, scanUrl: (process.env.CIPHERSCAN_API_URL ?? "").trim().replace(/\/+$/, "") })
}
