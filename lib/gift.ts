// A gift's link. An order can be handed on as a gift: the same order and the same secret, opened
// on a page of its own (/g/<id>) that shows the item and how to use it, and leaves out what it
// cost and how it was paid. It is a way of showing an order, not a second secret: whoever has the
// gift's link can also write the order's link from it, and the order's page shows the price.

// The gift's link as a path, from the order's name and its secret. Null when either is not there:
// a link without the secret opens nothing.
export function giftPath(id: string, secret: string) {
  return id && secret ? `/g/${id}#${secret}` : null
}

// What a gift's page says of the order behind it. Only "open" has an item to show.
export type GiftState = "open" | "not-yet" | "not-completed"

export function giftState(state: string): GiftState {
  if (state === "delivered") return "open"
  // Nothing was handed over, and nothing will be: the price lock ran out, or the payment is owed back.
  if (state === "expired" || state === "owed" || state === "refunded") return "not-completed"
  return "not-yet"
}
