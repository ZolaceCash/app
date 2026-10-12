import { engine } from "@/lib/payment"

// Whether other sellers can sell here right now, and the limits a seller works within. Kept apart
// from lib/sellers.ts so that the order code can ask without loading it.
//
// Selling is open only where the server says so (SELLING=open) and real payments run: a seller's
// item is paid straight to the seller's wallet, through the payment engine, and the stand-in has
// no wallet to pay. Anything else, and no seller's item is shown or sold and nobody can sign up.
export function sellingOn() {
  return (process.env.SELLING ?? "").trim() === "open" && engine().network !== "stand-in"
}

const whole = (text: string | undefined, fallback: number) => {
  const value = Number((text ?? "").trim())
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

// The owner's limits (12 Oct 2026): an item of a seller's costs at most $100 and a seller has at
// most 20 items, so that what a buyer can lose to a seller who does not deliver is bounded. Each
// can be changed where the server runs. `sellers` is how many may sign up at all: every one of
// them is a viewing key the payment engine tries each transaction against.
export function sellerLimits() {
  return {
    maxPriceCents: whole(process.env.SELLER_MAX_PRICE, 100) * 100,
    maxItems: whole(process.env.SELLER_MAX_ITEMS, 20),
    sellers: whole(process.env.SELLERS_MAX, 500),
  }
}
