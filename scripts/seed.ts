import { getDb, schema } from "../lib/db"
import { TEST_ITEMS } from "../lib/db/seed"

// Adds the test items to the database (lib/db/seed.ts). An empty database gets them by itself
// when it is first opened; this command is for one that already has other products. Safe to run
// again: existing slugs are left as they are.
async function main() {
  const db = await getDb()
  for (const item of TEST_ITEMS) {
    await db
      .insert(schema.products)
      .values({ ...item, kind: "test" })
      .onConflictDoNothing({ target: schema.products.slug })
  }
  const all = await db.select().from(schema.products)
  console.log(`${all.length} product(s) in the database: ${all.map((p) => p.slug).join(", ")}`)
}

main()
