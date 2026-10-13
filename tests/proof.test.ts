import assert from "node:assert/strict"
import { test } from "node:test"

import { KEPT_DAYS } from "../lib/order-times"
import { STORED } from "../lib/proof"
import { TERMS, TERMS_CHANGED } from "../lib/terms"

test("the /proof page explains every column the server stores", () => {
  const unexplained = STORED.flatMap((table) =>
    table.columns.filter((column) => !column.note).map((column) => `${table.name}.${column.name}`)
  )
  assert.deepEqual(unexplained, [])
})

test("the /proof page covers every table", () => {
  assert.deepEqual(
    STORED.map((table) => table.name),
    ["orders", "stock", "products", "sellers", "vault_hours", "vault_state"]
  )
})

test("the page of what is stored and the terms say the days an order is kept as the code has them", () => {
  assert.equal(KEPT_DAYS, 7)
  const closed = STORED.find((table) => table.name === "orders")?.columns.find((column) => column.name === "closed_at")?.note ?? ""
  assert.ok(closed.includes(`${KEPT_DAYS} days`), closed)
  const kept = TERMS.find((term) => term.id === "what-is-kept")?.lines.join(" ") ?? ""
  assert.ok(kept.includes(`${KEPT_DAYS} days`), kept)
})

test("the terms say first that no lawyer reviewed them, name every part once and carry a date", () => {
  assert.match(TERMS[0].lines.join(" "), /No lawyer has reviewed them/)
  assert.equal(new Set(TERMS.map((term) => term.id)).size, TERMS.length)
  assert.match(TERMS_CHANGED, /^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
  // Nothing in them claims what no text of the site may claim.
  const all = TERMS.flatMap((term) => term.lines).join(" ")
  assert.ok(!/audited and|guarantee|fully private|anonymous|legal advice/i.test(all))
})
