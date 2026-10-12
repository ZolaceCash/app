import assert from "node:assert/strict"
import { test } from "node:test"

import { STORED } from "../lib/proof"

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
