// The two stretches of time an order has. Kept apart from lib/orders.ts so that the order page,
// which runs in the browser, can read them without loading the database.

// PLAN.md: the price is locked for 15 minutes.
export const LOCK_MS = 15 * 60 * 1000

// How long after the lock an order's page keeps asking by itself whether a payment came late.
// After that the page asks once each time it is opened, for as long as the order is watched
// (lib/orders.ts, watchMs).
export const LATE_MS = 45 * 60 * 1000
