// Orders a buyer chose to keep on their own device.
//
// The order's link is the receipt and there is no account to recover it from. A buyer who asks
// for it can have the browser keep the link: the order's name, its secret, and what it was for.
// It is kept in the browser's own storage and nowhere else. This file is the part with no browser
// in it: what a kept order is, and how the list is read, added to and cut. The shop's server is
// never sent any of it, and nothing here asks the server anything.

export type Kept = {
  // The order's name: the first half of its link.
  id: string
  // The secret half, after #. Without it the item cannot be opened.
  secret: string
  // What it was for, as the order page showed it when it was kept.
  item: string
  priceCents: number
  // When the buyer asked for it to be kept, in milliseconds.
  keptAt: number
}

// Where the list lives in the browser's storage.
export const KEPT_KEY = "zolace.kept"
// No more than this many are kept. The oldest go first.
export const KEPT_MOST = 50

const ID = /^[0-9a-z]{6,64}$/
const SECRET = /^[A-Za-z0-9_-]{16,256}$/

const whole = (value: unknown): value is Kept => {
  const order = value as Kept
  return (
    typeof order === "object" &&
    order !== null &&
    typeof order.id === "string" &&
    ID.test(order.id) &&
    typeof order.secret === "string" &&
    SECRET.test(order.secret) &&
    typeof order.item === "string" &&
    order.item.length > 0 &&
    order.item.length <= 200 &&
    Number.isSafeInteger(order.priceCents) &&
    order.priceCents >= 0 &&
    Number.isSafeInteger(order.keptAt) &&
    order.keptAt > 0
  )
}

const newestFirst = (list: Kept[]) => [...list].sort((a, b) => b.keptAt - a.keptAt)

// The list as the storage holds it, newest first. Whatever is not a whole kept order is left out:
// the storage can be edited by hand, or hold something an older page wrote.
export function readKept(text: string | null): Kept[] {
  if (!text) return []
  try {
    const found: unknown = JSON.parse(text)
    if (!Array.isArray(found)) return []
    const seen = new Set<string>()
    return newestFirst(found.filter(whole)).filter((order) => !seen.has(order.id) && seen.add(order.id))
  } catch {
    return []
  }
}

// The list with one more order in it. An order that is already there is replaced, not doubled.
// Null when the order is not a whole one: a link with no secret is not worth keeping.
export function withKept(list: Kept[], order: Kept): Kept[] | null {
  if (!whole(order)) return null
  return newestFirst([order, ...list.filter((kept) => kept.id !== order.id)]).slice(0, KEPT_MOST)
}

export const withoutKept = (list: Kept[], id: string) => list.filter((order) => order.id !== id)

export const isKept = (list: Kept[], id: string, secret: string) => list.some((order) => order.id === id && order.secret === secret)

// The order's whole link, as a path. It is only ever opened by a plain page load, so the part
// after # never reaches the server.
export const keptHref = (order: Pick<Kept, "id" | "secret">) => `/o/${order.id}#${order.secret}`
