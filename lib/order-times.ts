// The two stretches of time an order has. Kept apart from lib/orders.ts so that the order page,
// which runs in the browser, can read them without loading the database.

// PLAN.md: the price is locked for 15 minutes.
export const LOCK_MS = 15 * 60 * 1000

// How long after the lock an order's page keeps asking by itself whether a payment came late.
// After that the page asks once each time it is opened, for as long as the order is watched
// (lib/orders.ts, watchMs).
export const LATE_MS = 45 * 60 * 1000

// How many days an order is kept on the server after it finishes or runs out of time (the owner,
// 13 Oct 2026). It is the same seven days the payment engine watches an address for a payment
// that comes late or twice, so no payment arrives for an order that is already gone. The site's
// texts and the terms say this number: ORDER_RETENTION_DAYS can still set another one where the
// server runs, and whoever does that has to change the texts with it.
export const KEPT_DAYS = 7

// How short and how long a buyer's report about an item may be, in characters.
export const PROBLEM_MIN = 10
export const PROBLEM_MAX = 500
