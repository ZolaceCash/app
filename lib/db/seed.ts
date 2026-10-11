import { sql } from "drizzle-orm"
import type { LibSQLDatabase } from "drizzle-orm/libsql"

import * as schema from "./schema"

// The test items a visitor can order while the shop has no real goods and no real payments.
// Their "codes" are made up at checkout and unlock nothing.
export const TEST_ITEMS = [
  {
    slug: "test-licence",
    name: "Test licence key",
    blurb: "A made-up licence key, to see an order run from checkout to the item.",
    priceCents: 1000,
  },
  {
    slug: "test-voucher",
    name: "Test voucher",
    blurb: "A made-up voucher code. Cheap, so the amount in ZEC is small.",
    priceCents: 500,
  },
  {
    slug: "test-gift-card",
    name: "Test gift card",
    blurb: "A made-up card code. Order it and pass the link on to see a gift arrive.",
    priceCents: 2500,
  },
]

// Puts the test items on the shelf when there are no products at all. A shelf that already has
// something on it, test or real, is left alone.
export async function seedTestItems(db: LibSQLDatabase<typeof schema>) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.products)
  if (count > 0) return
  await db
    .insert(schema.products)
    .values(TEST_ITEMS.map((item) => ({ ...item, kind: "test" as const })))
    .onConflictDoNothing({ target: schema.products.slug })
}
