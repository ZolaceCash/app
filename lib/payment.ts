// The payment engine sits behind this interface so it can be replaced (PLAN.md, "Architecture").
// Today there is only the stand-in below: no Zcash node, no real address, no money. The real one
// holds a viewing key and nothing that can spend; stage 0 of the roadmap decides which engine it is.

export const CONFIRMATIONS_NEEDED = 3

export type Invoice = { orderId: string; address: string; zat: number; seenAt: number | null }

export interface PaymentEngine {
  // True when payments are pretend. The site says so wherever an order is shown.
  readonly test: boolean
  // An address made for this order and no other.
  createAddress(orderId: string): Promise<string>
  // How many blocks deep the payment is. 0 when it is unseen or only just seen.
  confirmations(invoice: Invoice, now: number): Promise<number>
}

// A stand-in block: far shorter than a real one (about 75 seconds), so a test order finishes
// while someone is watching.
const TEST_BLOCK_MS = 4000

// Pretends a payment arrives when the buyer presses "Simulate the payment" (which sets seenAt)
// and that a block follows every few seconds after that.
export const standIn: PaymentEngine = {
  test: true,
  async createAddress(orderId) {
    // Deliberately not shaped like a Zcash address, so it cannot be mistaken for one.
    return `test-address-${orderId.slice(0, 12)}`
  },
  async confirmations(invoice, now) {
    if (invoice.seenAt === null) return 0
    return Math.min(CONFIRMATIONS_NEEDED, Math.floor((now - invoice.seenAt) / TEST_BLOCK_MS))
  },
}

export const engine: PaymentEngine = standIn
