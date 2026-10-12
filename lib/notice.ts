// What a buyer's own browser tells them when their order moves.
//
// The shop has no email and no number to reach a buyer on, and an item that is bought to order
// can take hours. A buyer who asks for it is told by the browser itself: the order's page, left
// open in a tab, shows a notice when the order's state changes. Nothing is sent anywhere for it.
//
// This file is the part with no browser in it: which move is worth a notice, and its words. A
// notice is shown by the device, perhaps on a locked screen, so it never names the item, an
// amount or the order.

export type Notice = { title: string; body: string }

// Where an order stands, as far as a notice goes: its state, except that a paid order whose item
// is still being bought or made is a stage of its own. That is the one wait that takes hours.
export function stageOf(order: { state: string; handBy: number | null; making: boolean }): string {
  if (order.state !== "confirmed") return order.state
  return order.handBy != null ? "buying" : order.making ? "making" : "confirmed"
}

// The notice for an order that went from one stage to another. Null when nothing is worth saying:
// the page was only just opened (there is no earlier stage), the stage did not change, or the
// move is one the next move follows within seconds.
export function noticeFor(from: string | null, to: string): Notice | null {
  if (from === null || from === to) return null
  switch (to) {
    case "seen":
      return { title: "Your payment was seen", body: "The order is waiting for the network to confirm it." }
    case "underpaid":
      return { title: "More is needed for your order", body: "Less than the price arrived. The order's page says what is missing." }
    case "confirmed":
      // An item from stock is handed over at once: the next notice says so.
      return null
    case "buying":
      return { title: "Your payment is confirmed", body: "The item is now being bought for your order." }
    case "making":
      return { title: "Your payment is confirmed", body: "The item is now being prepared for your order." }
    case "delivered":
      return { title: "Your item is ready", body: "It has opened on the order's page." }
    case "owed":
      return { title: "A refund is owed to you", body: "Nothing was handed over. The order's page asks where the refund should go." }
    case "refunded":
      return { title: "Your refund was sent", body: "The order's page has the details." }
    case "expired":
      return { title: "The price lock ran out", body: "No payment was seen in time, so the order closed." }
    default:
      return null
  }
}

// Whether there is anything left to be told about: an order at one of these stages will not move again.
export const settled = (stage: string) => stage === "delivered" || stage === "refunded"

// Whether the order is in the long wait, where being told is worth the most.
export const longWait = (stage: string) => stage === "buying" || stage === "making"

// Where the browser remembers, for one tab, that the buyer asked to be told about one order. It
// holds the order's name and nothing else: never the secret.
export const tellKey = (id: string) => `zolace.tell.${id}`
